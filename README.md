# Image Encryptor (Secure Zero-Knowledge Web Tool)

[![AES-256-GCM](https://img.shields.io/badge/Cipher-AES--256--GCM-red.svg)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
[![Web Crypto API](https://img.shields.io/badge/Security-Web_Crypto_API_(Zero--Knowledge)-emerald.svg)](https://w3c.github.io/webcrypto/)
[![React + Vite + TS](https://img.shields.io/badge/Frontend-React_18_+_Vite_+_TS-blue.svg)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_(Optional)-teal.svg)](https://fastapi.tiangolo.com/)
[![Deployment: Vercel](https://img.shields.io/badge/Frontend_Deploy-Vercel-black.svg)](https://vercel.com/)
[![Deployment: Render](https://img.shields.io/badge/Backend_Deploy-Render-46E3B7.svg)](https://render.com/)

A modern, privacy-first **Image Encryptor** web application developed for **Supraja Technologies**. 

This application transforms the desktop Python/Tkinter application into a responsive web application where all encryption and decryption operations execute **100% locally inside the user's browser** via the hardware-accelerated **Web Crypto API**. Unencrypted images and secret decryption keys **never** leave your device. Even the hosting server or website owner cannot inspect your images or decrypt your files.

---

## Architecture & Security Highlights

### 1. In-Browser Authenticated Encryption (AES-256-GCM)
- **Algorithm:** AES-256-GCM (Galois/Counter Mode) with 128-bit GMAC authentication tag.
- **Key Derivation:** PBKDF2-HMAC-SHA256 with **250,000 iterations** and a 16-byte cryptographically secure random salt (`crypto.getRandomValues`).
- **Initialization Vector (IV):** 12-byte (96-bit) fresh cryptographic nonce per encryption session.
- **Integrity Guarantee:** Any bit alteration, tampering, or incorrect decryption key triggers an immediate authentication rejection.
- **Metadata Protection:** Original filename and MIME type are securely packed and encrypted inside the authenticated ciphertext payload.

### 2. Zero-Knowledge Privacy Guarantee
- The browser processes image files in local memory as an `ArrayBuffer`.
- **Keys and plaintext images are never transmitted over the network.**
- No user accounts, database tracking, or surveillance.

### 3. Dual-Channel Out-Of-Band Sharing & Email Interface
The web application provides an integrated email dispatch workflow:
- **Exactly 3 Input Fields:**
  1. `Sender Email`: Address of the sender.
  2. `Personal Message (Optional)`: Context/note included in email body.
  3. `Receiver Email`: Recipient address.
- **Action:** Clicking **Send Encrypted Image** automatically attaches the client-side encrypted `.secimg` file.
- **Zero-Knowledge Security Rule:** Decryption keys are **never** attached or emailed. The receiver must obtain the key separately through an out-of-band channel (SMS, Signal, WhatsApp).
- **No Frontend Credentials:** SMTP credentials and passwords are strictly confined to backend environment variables. Raw unencrypted images and keys are never sent to the server.

### 4. Backward Compatibility
The decryption engine automatically detects and supports:
- **Modern `.secimg` container:** AES-256-GCM with embedded filename and MIME recovery.
- **Legacy desktop `.encrypted` files:** AES-256-CBC files created by the original desktop Python tool.

---

## Directory Structure

```text
safe_mail_sender/
├── frontend/                     # React + Vite + TypeScript web application
│   ├── public/
│   │   ├── supraja-logo.png      # Supraja Technologies brand banner
│   │   └── lock-icon.png         # Document lock application icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx        # Brand header with security badges
│   │   │   ├── TabNav.tsx        # Encrypt / Decrypt / Share navigation
│   │   │   ├── EncryptCard.tsx   # Image upload, key gen, AES-256-GCM encryptor
│   │   │   ├── DecryptCard.tsx   # File upload, key input, decryptor & preview
│   │   │   ├── ShareCard.tsx     # Dual-channel safe share & optional dispatch
│   │   │   ├── ActivityLog.tsx   # Real-time operation log
│   │   │   └── SecurityBadge.tsx # Privacy & zero-knowledge architecture card
│   │   ├── utils/
│   │   │   ├── webCrypto.ts      # Web Crypto API engine (AES-GCM & legacy CBC)
│   │   │   └── fileHelpers.ts    # File reading, blob downloads, hex utilities
│   │   ├── types/
│   │   │   └── crypto.ts         # TypeScript interfaces
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── vercel.json               # Vercel SPA routing configuration
│   └── .env.example
├── backend/                      # Optional Python FastAPI backend for Render
│   ├── main.py                   # FastAPI server with zero-knowledge transit endpoints
│   ├── requirements.txt
│   ├── Procfile                  # Render deployment process definition
│   ├── render.yaml               # Render Infrastructure-as-Code blueprint
│   ├── test_backend.py           # Endpoint security test suite
│   └── .env.example
├── main.py                       # Original desktop application (preserved)
├── package.json                  # Root monorepo scripts
├── requirements.txt              # Root python dependencies
└── README.md
```

---

## Local Setup & Development

### Prerequisites
- **Node.js** >= 18.x
- **Python** >= 3.10 (only if running the optional backend)

### 1. Frontend Setup (React + Vite)
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

To create an optimized production build:
```bash
npm run build
npm run preview
```

### 2. Backend Setup (Optional FastAPI Server)
If you wish to run the optional zero-knowledge transit relay or SMTP email dispatcher:
```bash
# Navigate to backend directory
cd backend

# Create virtual environment (optional)
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --reload --port 8000
```
Open [http://localhost:8000/docs](http://localhost:8000/docs) to view interactive Swagger API documentation.

---

## Deployment Guide

### A. Deploy Frontend on Vercel

The frontend is a static single-page application (SPA). It requires zero server maintenance and runs entirely on Vercel's global Edge Network.

1. **Push your repository** to GitHub, GitLab, or Bitbucket.
2. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your repository.
4. In the Project Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Set Environment Variables**:
   Under **Environment Variables**, add:
   - `VITE_API_URL`: Your live Render backend URL (e.g. `https://your-service.onrender.com`).
   *(Note: You can also configure or test the Backend URL directly in the web UI under the "Backend Connection" settings without redeploying).*
6. Click **Deploy**. Your zero-knowledge Image Encryptor will be live with free SSL.

*(Note: `frontend/vercel.json` is pre-configured with SPA rewrites to ensure direct URL refreshes work seamlessly).*

---

### B. Deploy Backend on Render (Centralized Email Service)

The backend provides centralized zero-knowledge email delivery of the encrypted `.secimg` attachments using your configured Gmail account:
- Zero-knowledge ephemeral file relay (`/api/share/transit`).
- Centralized Gmail SMTP delivery of encrypted attachments (`/api/share/email`).
- From header is locked to your configured Gmail address (preventing spoofing).
- Reply-To is automatically set to the user's entered sender email.
- Decryption keys and plaintext images never touch the backend.

> **Render Free Tier Notice:** Free web services on Render automatically spin down after 15 minutes of inactivity. When inactive, the first incoming request takes **50 to 90 seconds** while the container boots up. The web application includes an automatic status check and helpful diagnostic notices so you know when the backend is waking up.

#### 1. Setup Your Gmail App Password
1. In your Google Account, enable **2-Step Verification** (if not already enabled).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create a new App Password (name it e.g. `Image Encryptor`).
4. Copy the generated 16-character password (e.g. `abcd efgh ijkl mnop`).

#### 2. Configure Render Web Service
1. In the [Render Dashboard](https://dashboard.render.com/), select your Web Service (or click **New** -> **Web Service**).
2. Set:
   - **Root Directory:** `backend`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free
3. Add Environment Variables in Render:
   - `CORS_ORIGINS`: `https://*.vercel.app,http://localhost:3000,http://localhost:5173`
   - `SMTP_EMAIL`: `your-gmail@gmail.com` (Your Gmail address used for centralized sending)
   - `SMTP_APP_PASSWORD`: `your-16-char-app-password` (Your 16-character Gmail App Password)
   - `SMTP_SERVER`: `smtp.gmail.com`
   - `SMTP_PORT`: `587`
4. Click **Save Changes** (or **Create Web Service**).
5. Once deployed, copy your Render URL (e.g., `https://your-app.onrender.com`) and paste it as `VITE_API_URL` on Vercel or in the web UI.

---

## Verification & Testing

### 1. Test In-Browser Encryption & Decryption
1. Open the application.
2. In **Encrypt Image**, upload any image (`.png`, `.jpg`, `.webp`).
3. Click **Gen 256-bit Key** (or type a custom passphrase) and copy the key.
4. Click **Encrypt Image (AES-256-GCM)**.
5. Click **Download Encrypted File (.secimg)**.
6. Switch to the **Decrypt Image** tab.
7. Drop the `.secimg` file.
8. Enter an **incorrect key**: verify that the application immediately displays an authentication error.
9. Enter the **correct key**: verify that the exact original image is restored and rendered in high resolution.
10. Click **Download Decrypted Image** to save the restored image.

---

## License & Credits
- Developed for **Supraja Technologies**
- AES-256-GCM Cryptographic Implementation via W3C Web Crypto API

