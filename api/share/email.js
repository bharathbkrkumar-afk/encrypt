import nodemailer from 'nodemailer';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
};

const DEFAULT_SENDER_EMAIL = 'encryptthreeiota@gmail.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      return res.status(200).end();
    }
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (req.method !== 'POST') {
    if (res && typeof res.status === 'function') {
      return res.status(405).json({ detail: 'Method Not Allowed' });
    }
    return new Response(JSON.stringify({ detail: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let receiverEmail = '';
    let senderEmail = DEFAULT_SENDER_EMAIL;
    let personalMessage = '';
    let filename = 'encrypted_image.secimg';
    let fileBuffer = null;

    // Web Standard Request parsing (Vercel Node / Edge)
    if (typeof req.formData === 'function') {
      const formData = await req.formData();
      receiverEmail = (formData.get('receiver_email') || '').toString().trim();
      senderEmail = (formData.get('sender_email') || DEFAULT_SENDER_EMAIL).toString().trim();
      personalMessage = (formData.get('personal_message') || '').toString().trim();
      filename = (formData.get('filename') || 'encrypted_image.secimg').toString().trim();

      const file = formData.get('encrypted_file');
      if (file && typeof file.arrayBuffer === 'function') {
        const ab = await file.arrayBuffer();
        fileBuffer = Buffer.from(ab);
      }
    } else {
      // Node.js stream fallback: parse standard multi-part payload if passed as stream
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks);

      // Extract boundary from Content-Type
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

      if (boundaryMatch) {
        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const parts = rawBody.toString('binary').split(`--${boundary}`);

        for (const part of parts) {
          if (!part || part === '--\r\n' || part === '--') continue;
          if (part.includes('name="receiver_email"')) {
            receiverEmail = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, '').trim() || '';
          } else if (part.includes('name="sender_email"')) {
            senderEmail = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, '').trim() || DEFAULT_SENDER_EMAIL;
          } else if (part.includes('name="personal_message"')) {
            personalMessage = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, '').trim() || '';
          } else if (part.includes('name="filename"')) {
            filename = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, '').trim() || 'encrypted_image.secimg';
          } else if (part.includes('name="encrypted_file"')) {
            const splitIdx = part.indexOf('\r\n\r\n');
            if (splitIdx !== -1) {
              const fileContentBinary = part.slice(splitIdx + 4, part.length - 2);
              fileBuffer = Buffer.from(fileContentBinary, 'binary');
            }
          }
        }
      }
    }

    if (!receiverEmail || !EMAIL_REGEX.test(receiverEmail)) {
      const errRes = { detail: 'Please enter a valid Receiver Email address.' };
      if (res && res.status) return res.status(400).json(errRes);
      return new Response(JSON.stringify(errRes), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!fileBuffer || fileBuffer.length < 32) {
      const errRes = { detail: 'Invalid or missing encrypted file payload.' };
      if (res && res.status) return res.status(400).json(errRes);
      return new Response(JSON.stringify(errRes), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Security check: ensure payload is NOT a raw unencrypted image
    if (
      fileBuffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) ||
      fileBuffer.slice(0, 4).toString('ascii') === 'GIF8' ||
      (fileBuffer.slice(0, 4).toString('ascii') === 'RIFF' && fileBuffer.slice(8, 12).toString('ascii') === 'WEBP')
    ) {
      const errRes = { detail: 'Security Violation: Raw unencrypted image detected. File must be encrypted client-side first.' };
      if (res && res.status) return res.status(400).json(errRes);
      return new Response(JSON.stringify(errRes), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const smtpEmail = (process.env.SMTP_EMAIL || DEFAULT_SENDER_EMAIL).trim();
    const rawPass = (process.env.SMTP_APP_PASSWORD || '').trim();
    const smtpPassword = rawPass.replace(/\s+/g, '');

    if (!smtpPassword) {
      const errRes = { detail: 'Server SMTP is not configured. Please set SMTP_APP_PASSWORD in Vercel Environment Variables.' };
      if (res && res.status) return res.status(503).json(errRes);
      return new Response(JSON.stringify(errRes), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // Transporter using Port 465 SSL (fully open on Vercel)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpEmail,
        pass: smtpPassword,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    const bodyLines = [
      '======================================================================',
      '                  SECURE ENCRYPTED IMAGE FILE                         ',
      '               Image Encryptor • AES-256-GCM                          ',
      '======================================================================',
      '',
      'DISPATCH DETAILS:',
      `  From:     ${smtpEmail} (Image Encryptor Secure Dispatcher)`,
      `  To:       ${receiverEmail}`,
      '',
    ];

    if (personalMessage) {
      bodyLines.push('PERSONAL MESSAGE FROM SENDER:', `  "${personalMessage}"`, '');
    }

    bodyLines.push(
      'ATTACHMENT INFORMATION:',
      `  Encrypted File: ${filename}`,
      '  Cipher:         AES-256-GCM Authenticated Encryption',
      '',
      '----------------------------------------------------------------------',
      'IMPORTANT ZERO-KNOWLEDGE SECURITY NOTICE:',
      '----------------------------------------------------------------------',
      '1. The encrypted image file is attached to this email.',
      '2. For zero-knowledge confidentiality, the DECRYPTION KEY IS NOT',
      '   INCLUDED in this email.',
      '3. The sender must provide you with the secret decryption',
      '   key via a separate, private communication channel (e.g. Signal,',
      '   WhatsApp, SMS, or in person).',
      '4. Once you receive the key, visit the Image Encryptor web tool,',
      '   navigate to "Decrypt Image", drop this attached file, and enter',
      '   the decryption key to restore the original image.',
      '======================================================================'
    );

    // Send email with encrypted attachment
    await transporter.sendMail({
      from: `"Image Encryptor" <${smtpEmail}>`,
      to: receiverEmail,
      replyTo: smtpEmail,
      subject: 'Image Encryptor – Secure Image',
      text: bodyLines.join('\n'),
      attachments: [
        {
          filename: filename,
          content: fileBuffer,
        },
      ],
    });

    const successData = {
      success: true,
      message: `Encrypted image successfully dispatched to ${receiverEmail} from ${smtpEmail}.`,
    };

    if (res && typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json(successData);
    }
    return new Response(JSON.stringify(successData), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    const errorMsg = error.message || 'SMTP dispatch error';
    const errData = { detail: `Email sending failed: ${errorMsg}` };

    if (res && typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(500).json(errData);
    }
    return new Response(JSON.stringify(errData), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

