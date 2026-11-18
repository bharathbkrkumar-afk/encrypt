import os
import re
import smtplib
import socket
import time
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from typing import Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

app = FastAPI(
  title="Image Encryptor API",
  description="Privacy-focused, zero-knowledge backend for Image Encryptor. The server never receives or stores encryption keys or unencrypted images.",
  version="1.0.0"
)

# CORS configuration for Vercel, Render, and local development
allowed_origins_raw = os.getenv(
  "CORS_ORIGINS",
  "http://localhost:3000,http://localhost:5173,https://*.vercel.app"
)
origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip() and origin.strip() != "*"]

# Zero-knowledge public API:
# 1. Do NOT set allow_credentials=True with allow_origins=["*"] because modern browser
#    specifications immediately reject Access-Control-Allow-Origin: * when credentials flag is enabled,
#    triggering "TypeError: Failed to fetch".
# 2. Add allow_origin_regex for any Vercel domain (*.vercel.app) to allow preview & production deployments.
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_origin_regex=r"^https://.*\.vercel\.app$",
  allow_credentials=False,
  allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
  allow_headers=["*"],
  expose_headers=["*"],
  max_age=86400,
)

# Ephemeral in-memory storage & default sender configuration
DEFAULT_SENDER_EMAIL = "encryptthreeiota@gmail.com"
transit_storage: Dict[str, Dict[str, Any]] = {}
TRANSIT_TTL_SECONDS = 86400  # 24 hours
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB safety limit
MAX_CONCURRENT_TRANSITS = 100  # memory exhaustion protection

# In-memory sliding window rate limiter for email abuse prevention
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 5
email_rate_limit: Dict[str, list] = {}


def check_rate_limit(client_id: str):
  """Enforces maximum emails per time window to prevent abuse and spam."""
  now = time.time()
  timestamps = [t for t in email_rate_limit.get(client_id, []) if now - t < RATE_LIMIT_WINDOW_SECONDS]
  if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
    raise HTTPException(
      status_code=status.HTTP_429_TOO_MANY_REQUESTS,
      detail=f"Rate limit exceeded: Maximum {RATE_LIMIT_MAX_REQUESTS} emails per minute allowed. Please wait before sending another image."
    )
  timestamps.append(now)
  email_rate_limit[client_id] = timestamps


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def sanitize_filename(filename: str) -> str:
  """Sanitizes filename to prevent header injection or directory traversal."""
  base = os.path.basename(filename)
  clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', base)
  return clean or "encrypted_image.secimg"


def clean_expired_transit():
  """Prunes expired temporary transit entries and enforces maximum capacity."""
  now = time.time()
  expired = [tid for tid, data in transit_storage.items() if data["expires_at"] < now]
  for tid in expired:
    del transit_storage[tid]

  # If still over capacity, drop the oldest entries
  if len(transit_storage) > MAX_CONCURRENT_TRANSITS:
    sorted_items = sorted(transit_storage.items(), key=lambda x: x[1]["expires_at"])
    for tid, _ in sorted_items[:len(transit_storage) - MAX_CONCURRENT_TRANSITS]:
      del transit_storage[tid]


def validate_email_address(email_str: str, field_name: str):
  """Validates an email address format and basic domain syntax."""
  if not email_str or not EMAIL_REGEX.match(email_str.strip()):
    raise HTTPException(
      status_code=400,
      detail=f"Invalid {field_name}: '{email_str}' is not a valid email address."
    )


@app.get("/")
def root():
  return {
    "app": "Image Encryptor API",
    "status": "online",
    "architecture": "Zero-Knowledge In-Browser WebCrypto",
    "docs": "/docs"
  }


@app.get("/api/health")
def health_check():
  clean_expired_transit()
  return {
    "status": "healthy",
    "uptime_timestamp": time.time(),
    "active_transit_files": len(transit_storage)
  }


@app.post("/api/share/email")
async def dispatch_encrypted_email(
  request: Request,
  receiver_email: str = Form(..., description="Email address of the intended recipient"),
  sender_email: Optional[str] = Form(None, description="Optional sender email; defaults to encryptthreeiota@gmail.com"),
  personal_message: Optional[str] = Form(None, description="Optional personal message from sender"),
  filename: str = Form(..., description="Name of the encrypted file attachment"),
  encrypted_file: UploadFile = File(..., description="The client-side encrypted image file (.secimg)")
):
  """
  Dispatches a client-side encrypted image file to a recipient email using centralized Gmail SMTP.
  
  CRITICAL ZERO-KNOWLEDGE & SECURITY CONSTRAINTS:
  - This endpoint NEVER receives, accepts, or stores any decryption key.
  - The server explicitly checks that the attached file is NOT an unencrypted image.
  - Decryption keys must be shared by the sender out-of-band (e.g. via SMS, Signal, WhatsApp).
  - All SMTP credentials are read strictly from backend environment variables (SMTP_EMAIL / SMTP_APP_PASSWORD).
  - The 'From' address is locked to the configured Gmail address (no spoofing allowed).
  - Rate limiting is enforced per client IP and recipient to prevent abuse.
  """
  sender = (sender_email or DEFAULT_SENDER_EMAIL).strip()
  if not sender:
    sender = DEFAULT_SENDER_EMAIL
  receiver = receiver_email.strip()
  message_text = (personal_message or "").strip()

  # 1. Rate limiting check (client IP & receiver email)
  client_ip = request.client.host if request and request.client else "unknown"
  check_rate_limit(f"ip:{client_ip}")
  check_rate_limit(f"receiver:{receiver.lower()}")

  # 2. Validate email addresses
  validate_email_address(sender, "Sender Email")
  validate_email_address(receiver, "Receiver Email")

  # 3. Read and validate encrypted file payload
  encrypted_bytes = await encrypted_file.read()
  if len(encrypted_bytes) < 32:
    raise HTTPException(status_code=400, detail="Invalid encrypted file payload: file is too small.")

  if len(encrypted_bytes) > MAX_FILE_SIZE_BYTES:
    raise HTTPException(status_code=413, detail="File too large. Maximum supported encrypted file size is 50MB.")

  safe_filename = sanitize_filename(filename)

  # 4. Security check: Ensure payload is NOT a raw unencrypted image (PNG/JPEG/GIF/WebP magic check)
  if (
    encrypted_bytes.startswith(b"\x89PNG\r\n\x1a\n") or
    encrypted_bytes.startswith(b"\xff\xd8\xff") or
    encrypted_bytes.startswith(b"GIF8") or
    (encrypted_bytes.startswith(b"RIFF") and b"WEBP" in encrypted_bytes[:16])
  ):
    raise HTTPException(
      status_code=400,
      detail="Security Violation: Raw unencrypted image detected. The file must be encrypted client-side using AES-256-GCM before dispatch."
    )

  # 5. Load centralized Gmail SMTP credentials from backend environment variables ONLY
  smtp_server = (os.getenv("SMTP_SERVER") or "smtp.gmail.com").strip()
  smtp_port = int(os.getenv("SMTP_PORT", "587"))
  smtp_email = (os.getenv("SMTP_EMAIL") or os.getenv("SENDER_EMAIL") or DEFAULT_SENDER_EMAIL).strip()
  smtp_password = (os.getenv("SMTP_APP_PASSWORD") or os.getenv("SENDER_PASSWORD") or "").strip()

  if not smtp_password:
    return JSONResponse(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      content={
        "status": "smtp_unconfigured",
        "detail": (
          "Centralized email service is not configured on the server. "
          "The server administrator must configure SMTP_APP_PASSWORD in Render environment variables."
        )
      }
    )

  # 6. Domain DNS check with timeout to prevent asyncio event-loop blocking
  try:
    receiver_domain = receiver.split("@")[-1]
    socket.setdefaulttimeout(3.0)
    socket.gethostbyname(receiver_domain)
  except Exception:
    # If DNS lookup times out or fails (e.g. domain uses MX records only, or offline testing),
    # proceed to SMTP server which performs authoritative recipient validation.
    pass

  # 7. Compose secure email
  try:
    msg = MIMEMultipart()
    # From is locked to the configured Gmail address (no spoofing)
    msg["From"] = f"Image Encryptor <{smtp_email}>"
    # Reply-To is set to the system sender or specified sender
    msg["Reply-To"] = sender if sender != smtp_email else smtp_email
    msg["To"] = receiver
    # Subject as specifically requested
    msg["Subject"] = "Image Encryptor – Secure Image"

    # Build clear body with sender/receiver details and security notice
    body_lines = [
      "======================================================================",
      "                  SECURE ENCRYPTED IMAGE FILE                         ",
      "               Image Encryptor • AES-256-GCM                          ",
      "======================================================================",
      "",
      "DISPATCH DETAILS:",
      f"  From:     {smtp_email} (Image Encryptor Secure Dispatcher)",
      f"  To:       {receiver}",
      "",
    ]

    if message_text:
      body_lines.extend([
        "PERSONAL MESSAGE FROM SENDER:",
        f"  \"{message_text}\"",
        "",
      ])

    body_lines.extend([
      "ATTACHMENT INFORMATION:",
      f"  Encrypted File: {safe_filename}",
      "  Cipher:         AES-256-GCM Authenticated Encryption",
      "",
      "----------------------------------------------------------------------",
      "IMPORTANT ZERO-KNOWLEDGE SECURITY NOTICE:",
      "----------------------------------------------------------------------",
      "1. The encrypted image file is attached to this email.",
      "2. For zero-knowledge confidentiality, the DECRYPTION KEY IS NOT",
      "   INCLUDED in this email.",
      "3. The sender must provide you with the secret decryption",
      "   key via a separate, private communication channel (e.g. Signal,",
      "   WhatsApp, SMS, or in person).",
      "4. Once you receive the key, visit the Image Encryptor web tool,",
      "   navigate to 'Decrypt Image', drop this attached file, and enter",
      "   the decryption key to restore the original image.",
      "======================================================================",
    ])

    body_text = "\n".join(body_lines)
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # Attach the encrypted image in memory only (never written to disk or database)
    part = MIMEBase("application", "octet-stream")
    part.set_payload(encrypted_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{safe_filename}"')
    msg.attach(part)

    # Connect and send via Gmail SMTP (Support both 465 SSL and 587 STARTTLS)
    if smtp_port == 465:
      server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=15)
    else:
      server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
      server.starttls()

    server.login(smtp_email, smtp_password)
    server.sendmail(smtp_email, receiver, msg.as_string())
    server.quit()

    return {
      "success": True,
      "message": f"Encrypted image successfully dispatched to {receiver} from {sender}."
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"SMTP dispatch failed: {str(e)}")


@app.options("/api/share/email")
def options_share_email():
  return Response(
    status_code=200,
    headers={
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    }
  )


@app.post("/api/share/transit")
async def create_transit_relay(
  encrypted_file: UploadFile = File(...)
):
  """
  Uploads a client-side encrypted blob for zero-knowledge temporary transit (24-hour TTL).
  Returns a unique transit_id. The server has NO key and cannot decrypt this blob.
  """
  clean_expired_transit()
  content = await encrypted_file.read()

  if len(content) < 32:
    raise HTTPException(status_code=400, detail="File too small.")

  if len(content) > MAX_FILE_SIZE_BYTES:
    raise HTTPException(status_code=413, detail="File too large. Maximum supported size is 50MB.")

  safe_name = sanitize_filename(encrypted_file.filename or "encrypted_image.secimg")

  # Security check: Ensure payload is not an unencrypted image
  if (
    content.startswith(b"\x89PNG\r\n\x1a\n") or
    content.startswith(b"\xff\xd8\xff") or
    content.startswith(b"GIF8") or
    (content.startswith(b"RIFF") and b"WEBP" in content[:16])
  ):
    raise HTTPException(
      status_code=400,
      detail="Security Violation: Raw unencrypted image detected."
    )

  transit_id = str(uuid.uuid4())
  transit_storage[transit_id] = {
    "filename": safe_name,
    "content": content,
    "expires_at": time.time() + TRANSIT_TTL_SECONDS
  }

  return {
    "transit_id": transit_id,
    "filename": safe_name,
    "size": len(content),
    "expires_in_seconds": TRANSIT_TTL_SECONDS
  }


@app.get("/api/share/transit/{transit_id}")
async def get_transit_file(transit_id: str):
  """
  Downloads an encrypted blob from temporary transit.
  """
  clean_expired_transit()
  if transit_id not in transit_storage:
    raise HTTPException(status_code=404, detail="File not found or has expired.")

  data = transit_storage[transit_id]
  return Response(
    content=data["content"],
    media_type="application/octet-stream",
    headers={"Content-Disposition": f'attachment; filename="{data["filename"]}"'}
  )
