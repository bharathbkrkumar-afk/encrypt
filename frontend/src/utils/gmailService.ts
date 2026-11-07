/**
 * Zero-Knowledge Google OAuth 2.0 & Gmail API Client
 * 
 * Enables users to send encrypted .secimg files directly from their own Gmail account.
 * - Uses Google's official Identity Services (GIS) Token Model.
 * - Requests the minimum required scope: https://www.googleapis.com/auth/gmail.send
 * - Runs 100% in the user's browser.
 * - Never transmits plaintext images or decryption keys.
 * - Does not require website accounts, server credentials, or passwords.
 */

export interface GmailSendOptions {
  senderEmail: string;
  receiverEmail: string;
  personalMessage?: string;
  attachmentFileName: string;
  attachmentBytes: Uint8Array;
}

/**
 * Ensures Google Identity Services script is loaded in the browser.
 */
export function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Window is not defined.'));
    }

    if (window.google?.accounts?.oauth2) {
      return resolve();
    }

    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services library.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services library.'));
    document.head.appendChild(script);
  });
}

/**
 * Requests an ephemeral OAuth access token from the user for gmail.send scope.
 */
export async function requestGmailAccessToken(
  clientId: string,
  loginHint?: string
): Promise<{ accessToken: string; expiresIn: number }> {
  await loadGoogleIdentityScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services SDK is not available.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        callback: (response) => {
          if (response.error) {
            if (response.error === 'access_denied') {
              return reject(new Error('Gmail authorization was declined or cancelled. You can retry when ready.'));
            }
            if (response.error === 'popup_closed_by_user') {
              return reject(new Error('Authorization popup was closed before completing sign-in.'));
            }
            return reject(new Error(`Google OAuth error: ${response.error_description || response.error}`));
          }

          if (!response.access_token) {
            return reject(new Error('No access token returned from Google authorization.'));
          }

          resolve({
            accessToken: response.access_token,
            expiresIn: response.expires_in || 3599
          });
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Google OAuth initialization failed. Check your Client ID and Authorized Origins.'));
        }
      });

      tokenClient.requestAccessToken({
        prompt: '',
        hint: loginHint || undefined
      });
    } catch (err: any) {
      reject(new Error(err.message || 'Failed to initialize Google OAuth Token Client.'));
    }
  });
}

/**
 * Converts a Uint8Array into a standard Base64 string in chunks to prevent stack overflow.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

/**
 * Encodes a string to RFC 4648 Base64URL without trailing padding.
 */
export function stringToBase64Url(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  return uint8ArrayToBase64(utf8Bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Composes an RFC 2822 MIME message containing the encrypted .secimg attachment,
 * then returns it encoded as a Base64URL string ready for the Gmail API.
 */
export function createGmailMimeMessage(options: GmailSendOptions): string {
  const boundary = `====SECIMG_BOUNDARY_${Date.now()}_${Math.random().toString(36).substring(2, 9)}====`;
  const subject = `Secure Encrypted Image from ${options.senderEmail}`;
  const safeFilename = options.attachmentFileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_') || 'encrypted_image.secimg';

  // Body lines
  const bodyLines = [
    '======================================================================',
    '                  SECURE ENCRYPTED IMAGE FILE                         ',
    '           Powered by Supraja Technologies • AES-256-GCM              ',
    '======================================================================',
    '',
    'SENDER DETAILS:',
    `  From: ${options.senderEmail}`,
    '',
    'RECEIVER DETAILS:',
    `  To:   ${options.receiverEmail}`,
    '',
  ];

  if (options.personalMessage?.trim()) {
    bodyLines.push(
      'PERSONAL MESSAGE FROM SENDER:',
      `  "${options.personalMessage.trim()}"`,
      ''
    );
  }

  bodyLines.push(
    'ATTACHMENT INFORMATION:',
    `  Encrypted File: ${safeFilename}`,
    '  Cipher:         AES-256-GCM Authenticated Encryption',
    '',
    '----------------------------------------------------------------------',
    'IMPORTANT ZERO-KNOWLEDGE SECURITY NOTICE:',
    '----------------------------------------------------------------------',
    '1. The encrypted image file is attached to this email.',
    '2. For zero-knowledge confidentiality, the DECRYPTION KEY IS NOT',
    '   INCLUDED in this email.',
    '3. The sender must provide you with the secret decryption key via a',
    '   separate, private communication channel (e.g. Signal, WhatsApp,',
    '   SMS, or in person).',
    '4. Once you receive the key, visit the Image Encryptor web tool,',
    '   navigate to "Decrypt Image", drop this attached file, and enter',
    '   the decryption key to restore the original image.',
    '======================================================================'
  );

  const bodyText = bodyLines.join('\r\n');
  const base64Attachment = uint8ArrayToBase64(options.attachmentBytes);

  // Build full RFC 2822 MIME structure
  const mimeParts = [
    `From: <${options.senderEmail}>`,
    `To: <${options.receiverEmail}>`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
    '',
    `--${boundary}`,
    `Content-Type: application/octet-stream; name="${safeFilename}"`,
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Attachment,
    '',
    `--${boundary}--`
  ];

  const fullMimeMessage = mimeParts.join('\r\n');
  return stringToBase64Url(fullMimeMessage);
}

/**
 * Dispatches an email via the official Gmail API using the sender's OAuth access token.
 */
export async function sendViaGmailApi(
  accessToken: string,
  rawBase64UrlMessage: string
): Promise<{ success: boolean; messageId: string }> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: rawBase64UrlMessage
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Gmail authorization has expired or was revoked. Please authorize again.');
    }
    if (response.status === 403) {
      const detail = data?.error?.message || 'Access forbidden';
      throw new Error(`Gmail API permission error: ${detail}. Ensure the Gmail API is enabled in your Google Cloud Project.`);
    }
    throw new Error(data?.error?.message || `Gmail API returned HTTP error ${response.status}`);
  }

  return {
    success: true,
    messageId: data.id || 'sent'
  };
}

