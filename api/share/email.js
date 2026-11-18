const nodemailer = require('nodemailer');

const DEFAULT_SENDER_EMAIL = 'encryptthreeiota@gmail.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function handler(req, res) {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Method Not Allowed. Use POST.' });
  }

  try {
    // Collect body bytes (whether pre-buffered or incoming stream)
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (typeof req.body === 'string') {
      rawBody = Buffer.from(req.body);
    } else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      rawBody = Buffer.concat(chunks);
    }

    if (rawBody.length > MAX_FILE_SIZE) {
      return res.status(413).json({ detail: 'File too large. Maximum 50MB.' });
    }

    // Extract boundary from Content-Type header
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);

    if (!boundaryMatch) {
      return res.status(400).json({ detail: 'Missing multipart boundary in Content-Type header.' });
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];

    // Parse multipart fields
    let receiverEmail = '';
    let senderEmail = DEFAULT_SENDER_EMAIL;
    let personalMessage = '';
    let filename = 'encrypted_image.secimg';
    let fileBuffer = null;

    // Split by boundary
    const boundaryBuffer = Buffer.from('--' + boundary);
    const parts = splitBuffer(rawBody, boundaryBuffer);

    for (const part of parts) {
      if (part.length < 4) continue;

      // Find header/body separator (\r\n\r\n)
      const separatorIdx = findSequence(part, Buffer.from('\r\n\r\n'));
      if (separatorIdx === -1) continue;

      const headerSection = part.slice(0, separatorIdx).toString('utf-8');
      // Body: skip \r\n\r\n (4 bytes), trim trailing \r\n
      let body = part.slice(separatorIdx + 4);
      if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
        body = body.slice(0, body.length - 2);
      }

      const nameMatch = headerSection.match(/name="([^"]+)"/);
      if (!nameMatch) continue;
      const fieldName = nameMatch[1];

      const isFile = headerSection.includes('filename="');

      if (fieldName === 'receiver_email' && !isFile) {
        receiverEmail = body.toString('utf-8').trim();
      } else if (fieldName === 'sender_email' && !isFile) {
        senderEmail = body.toString('utf-8').trim() || DEFAULT_SENDER_EMAIL;
      } else if (fieldName === 'personal_message' && !isFile) {
        personalMessage = body.toString('utf-8').trim();
      } else if (fieldName === 'filename' && !isFile) {
        filename = body.toString('utf-8').trim() || 'encrypted_image.secimg';
      } else if (fieldName === 'encrypted_file' && isFile) {
        fileBuffer = body;
      }
    }

    // Validate receiver email
    if (!receiverEmail || !EMAIL_REGEX.test(receiverEmail)) {
      return res.status(400).json({ detail: 'Please enter a valid Receiver Email address.' });
    }

    // Validate file
    if (!fileBuffer || fileBuffer.length < 32) {
      return res.status(400).json({ detail: 'Invalid or missing encrypted file. Encrypt an image first.' });
    }

    // Security check: reject raw unencrypted images
    if (
      (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47) ||
      (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) ||
      (fileBuffer.slice(0, 4).toString('ascii') === 'GIF8') ||
      (fileBuffer.slice(0, 4).toString('ascii') === 'RIFF' && fileBuffer.length > 11 && fileBuffer.slice(8, 12).toString('ascii') === 'WEBP')
    ) {
      return res.status(400).json({ detail: 'Security Violation: Raw unencrypted image detected. File must be encrypted client-side first.' });
    }

    // Load SMTP credentials from environment
    const smtpEmail = (process.env.SMTP_EMAIL || DEFAULT_SENDER_EMAIL).trim();
    const rawPass = (process.env.SMTP_APP_PASSWORD || '').trim();
    const smtpPassword = rawPass.replace(/\s+/g, '');

    if (!smtpPassword) {
      return res.status(503).json({ detail: 'Server email is not configured. Set SMTP_APP_PASSWORD in Vercel Environment Variables.' });
    }

    // Create transporter — Port 465 SSL (fully open on Vercel)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpEmail, pass: smtpPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    // Build email body
    const bodyLines = [
      '======================================================================',
      '                  SECURE ENCRYPTED IMAGE FILE                         ',
      '               Image Encryptor • AES-256-GCM                          ',
      '======================================================================',
      '',
      'DISPATCH DETAILS:',
      '  From:     ' + smtpEmail + ' (Image Encryptor Secure Dispatcher)',
      '  To:       ' + receiverEmail,
      '',
    ];

    if (personalMessage) {
      bodyLines.push('PERSONAL MESSAGE:', '  "' + personalMessage + '"', '');
    }

    bodyLines.push(
      'ATTACHMENT INFORMATION:',
      '  Encrypted File: ' + filename,
      '  Cipher:         AES-256-GCM Authenticated Encryption',
      '',
      '----------------------------------------------------------------------',
      'IMPORTANT ZERO-KNOWLEDGE SECURITY NOTICE:',
      '----------------------------------------------------------------------',
      '1. The encrypted image file is attached to this email.',
      '2. The DECRYPTION KEY IS NOT INCLUDED in this email.',
      '3. The sender must provide the decryption key separately',
      '   (e.g. via Signal, WhatsApp, SMS, or in person).',
      '4. Visit the Image Encryptor web tool to decrypt the image.',
      '======================================================================'
    );

    // Send email
    await transporter.sendMail({
      from: '"Image Encryptor" <' + smtpEmail + '>',
      to: receiverEmail,
      replyTo: smtpEmail,
      subject: 'Image Encryptor \u2013 Secure Image',
      text: bodyLines.join('\n'),
      attachments: [{ filename: filename, content: fileBuffer }],
    });

    return res.status(200).json({
      success: true,
      message: 'Encrypted image successfully dispatched to ' + receiverEmail + '.',
    });
  } catch (error) {
    const msg = error.message || 'Unknown error';
    return res.status(500).json({ detail: 'Email sending failed: ' + msg });
  }
}

handler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
module.exports.config = handler.config;

// --- Helper: split a Buffer by a delimiter Buffer ---
function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  while (start < buf.length) {
    const idx = findSequence(buf, delimiter, start);
    if (idx === -1) {
      parts.push(buf.slice(start));
      break;
    }
    if (idx > start) {
      parts.push(buf.slice(start, idx));
    }
    start = idx + delimiter.length;
  }
  return parts;
}

// --- Helper: find a byte sequence inside a Buffer ---
function findSequence(buf, seq, fromIndex) {
  fromIndex = fromIndex || 0;
  for (let i = fromIndex; i <= buf.length - seq.length; i++) {
    let found = true;
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}
