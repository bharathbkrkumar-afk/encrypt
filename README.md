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
   - `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth 2.0 Web Client ID (enables sending from users' own Gmail accounts).
   - `VITE_API_URL`: (Optional) Your live Render backend URL (e.g. `https://your-service.onrender.com`).
   *(Note: You can also configure or test both the Google Client ID and Backend URL directly in the web UI under the settings pills without redeploying).*
6. Click **Deploy**. Your zero-knowledge Image Encryptor will be live with free SSL.

*(Note: `frontend/vercel.json` is pre-configured with SPA rewrites to ensure direct URL refreshes work seamlessly).*

---

### B. Google Cloud OAuth 2.0 Setup (For User Gmail Sending)

To enable users to send encrypted `.secimg` attachments directly from their own Gmail accounts using Google's official OAuth:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Image-Encryptor-Web`).
3. Navigate to **APIs & Services** → **Library**, search for **Gmail API**, and click **Enable**.
4. Go to **APIs & Services** → **OAuth consent screen**:
   - Choose **External** user type.
   - Fill in the App name (e.g. `Image Encryptor`) and your developer contact email.
   - In **Scopes**, add `https://www.googleapis.com/auth/gmail.send` (Send emails on your behalf).
   - In **Test users**, add your own Gmail address (or publish the app to Production for any Google user).
5. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - **Application type:** `Web application`.
   - **Name:** `Image Encryptor Web Client`.
   - **Authorized JavaScript origins:**
     - `http://localhost:5173` (for local development)
     - `https://your-app.vercel.app` (your production Vercel URL)
6. Copy the generated **Client ID** (e.g. `123456789-abcdef.apps.googleusercontent.com`).
7. Paste this Client ID into:
   - The web UI's **Gmail OAuth Settings** drawer, OR
   - `frontend/.env` as `VITE_GOOGLE_CLIENT_ID`, OR
   - Vercel's Environment Variables.

*(Note: No Client Secret is needed or exposed in the frontend. Google Identity Services uses the Client ID with Authorized Origins for secure browser-side token authorization).*

---

### B. Deploy Backend on Render (Optional)

The backend is completely optional because encryption and decryption happen client-side in the browser. Deploy the backend to Render only if you want:
- Zero-knowledge ephemeral file relay (`/api/share/transit`).
- Backend SMTP email delivery of the encrypted `.secimg` attachment (`/api/share/email`).

> **Render Free Tier Notice:** Free web services on Render automatically spin down after 15 minutes of inactivity. When inactive, the first incoming request takes **50 to 90 seconds** while the container boots up. The web application includes an automatic status check and helpful diagnostic notices so you know when the backend is waking up.

#### Method 1: Using `render.yaml` Blueprint (Recommended)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New** -> **Blueprint**.
3. Connect your repository. Render will automatically detect `backend/render.yaml` and configure the service.
4. Click **Apply**.

#### Method 2: Manual Web Service
1. In Render, select **New Web Service**.
2. Connect your repo and set:
   - **Root Directory:** `backend`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free
3. Add Environment Variables:
   - `CORS_ORIGINS`: `https://*.vercel.app,http://localhost:3000,http://localhost:5173`
   - `SMTP_SERVER`: (e.g. `smtp.gmail.com` if enabling email dispatch)
   - `SMTP_PORT`: `587` (TLS) or `465` (SSL)
   - `SENDER_EMAIL`: (Your authenticated SMTP sender address)
   - `SENDER_PASSWORD`: (Your SMTP App Password)
4. Click **Create Web Service**.
5. Once deployed, copy your Render URL (e.g., `https://your-app.onrender.com`) and paste it into the **Backend Connection Settings** in the Image Encryptor web app or set it as `VITE_API_URL` on Vercel.

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

