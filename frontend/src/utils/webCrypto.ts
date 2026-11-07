import { DecryptedResult, EncryptionResult } from '../types/crypto';
import { bufferToHex, readFileAsArrayBuffer } from './fileHelpers';

const MAGIC_BYTES = new Uint8Array([0x53, 0x45, 0x43, 0x49, 0x4d, 0x47]); // "SECIMG"
const FORMAT_VERSION = 1;
const MODE_AES_GCM_PBKDF2 = 1;

const SALT_SIZE = 16;
const IV_SIZE = 12; // 96-bit IV recommended for AES-GCM
const PBKDF2_ITERATIONS = 250000;

/**
 * Generates a cryptographically strong random password or key
 */
export function generateSecureKey(type: 16 | 24 | 32 | 'token' = 32): string {
  if (type === 'token') {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    // Base64URL encoding
    return btoa(String.fromCharCode(...randomBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  const length = type;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_-+=[]{};:,.<>?/|';
  const allChars = lowercase + uppercase + digits + symbols;

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  // Ensure at least one of each category
  const result: string[] = [
    lowercase[randomValues[0] % lowercase.length],
    uppercase[randomValues[1] % uppercase.length],
    digits[randomValues[2] % digits.length],
    symbols[randomValues[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    result.push(allChars[randomValues[i] % allChars.length]);
  }

  // Shuffle array using Fisher-Yates
  const shuffleValues = new Uint32Array(length);
  crypto.getRandomValues(shuffleValues);
  for (let i = length - 1; i > 0; i--) {
    const j = shuffleValues[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

/**
 * Validates password strength (similar to desktop rules)
 */
export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  if (!password || password.length < 12) {
    return { isValid: false, message: 'Password should be at least 12 characters long.' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);

  if (!hasDigit || !hasUpper || !hasSymbol || !hasLower) {
    return {
      isValid: false,
      message: 'Recommend including uppercase, lowercase, numbers, and special symbols for maximum security.'
    };
  }

  return { isValid: true };
}

/**
 * Derives an AES-GCM 256-bit key from password + salt via PBKDF2
 */
async function deriveAesGcmKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an image file directly in the browser using AES-256-GCM
 */
export async function encryptImage(file: File, keyOrPassword: string): Promise<EncryptionResult> {
  const startTime = performance.now();
  const rawData = await readFileAsArrayBuffer(file);
  const originalBytes = new Uint8Array(rawData);

  // Generate cryptographic salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  // Derive AES-GCM Key
  const aesKey = await deriveAesGcmKey(keyOrPassword, salt);

  // Encode metadata (filename + mime type) inside the encrypted payload
  const enc = new TextEncoder();
  const filenameBytes = enc.encode(file.name);
  const mimeBytes = enc.encode(file.type || 'image/png');

  // Packed payload layout:
  // [2 bytes filename len] + [filename bytes] + [2 bytes mime len] + [mime bytes] + [image data]
  const packedSize = 2 + filenameBytes.length + 2 + mimeBytes.length + originalBytes.length;
  const packedBuffer = new Uint8Array(packedSize);
  const view = new DataView(packedBuffer.buffer);

  let offset = 0;
  view.setUint16(offset, filenameBytes.length);
  offset += 2;
  packedBuffer.set(filenameBytes, offset);
  offset += filenameBytes.length;

  view.setUint16(offset, mimeBytes.length);
  offset += 2;
  packedBuffer.set(mimeBytes, offset);
  offset += mimeBytes.length;

  packedBuffer.set(originalBytes, offset);

  // Encrypt packed payload with AES-256-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128
    },
    aesKey,
    packedBuffer as BufferSource
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Build final container file:
  // [Magic (6)] + [Version (1)] + [Mode (1)] + [Salt (16)] + [IV (12)] + [Ciphertext + Tag]
  const containerSize = MAGIC_BYTES.length + 2 + salt.length + iv.length + ciphertext.length;
  const container = new Uint8Array(containerSize);

  let containerOffset = 0;
  container.set(MAGIC_BYTES, containerOffset);
  containerOffset += MAGIC_BYTES.length;

  container[containerOffset++] = FORMAT_VERSION;
  container[containerOffset++] = MODE_AES_GCM_PBKDF2;

  container.set(salt, containerOffset);
  containerOffset += salt.length;

  container.set(iv, containerOffset);
  containerOffset += iv.length;

  container.set(ciphertext, containerOffset);

  const containerBlob = new Blob([container as BlobPart], { type: 'application/octet-stream' });
  const downloadUrl = URL.createObjectURL(containerBlob);
  const endTime = performance.now();

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const outFileName = `${baseName}_encrypted.secimg`;

  return {
    fileName: outFileName,
    originalSize: file.size,
    encryptedSize: container.byteLength,
    containerBlob,
    downloadUrl,
    keyUsed: keyOrPassword,
    saltHex: bufferToHex(salt),
    ivHex: bufferToHex(iv),
    encryptionTimeMs: Math.round(endTime - startTime)
  };
}

/**
 * Detects image MIME type from raw magic bytes
 */
function detectMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png'; // default fallback
}

/**
 * Decrypts a previously encrypted file (Modern SECIMG or Legacy CBC)
 */
export async function decryptFile(file: File, keyOrPassword: string): Promise<DecryptedResult> {
  const startTime = performance.now();
  const rawData = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(rawData);

  if (bytes.length < 32) {
    throw new Error('File is too small to be a valid encrypted image.');
  }

  // Check for SECIMG header
  let isSecImg = true;
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (bytes[i] !== MAGIC_BYTES[i]) {
      isSecImg = false;
      break;
    }
  }

  if (isSecImg) {
    // Modern SECIMG AES-256-GCM format
    let offset = MAGIC_BYTES.length;
    const version = bytes[offset++];
    const mode = bytes[offset++];

    if (version !== FORMAT_VERSION || mode !== MODE_AES_GCM_PBKDF2) {
      throw new Error(`Unsupported container version (${version}) or mode (${mode}).`);
    }

    const salt = bytes.slice(offset, offset + SALT_SIZE);
    offset += SALT_SIZE;

    const iv = bytes.slice(offset, offset + IV_SIZE);
    offset += IV_SIZE;

    const ciphertext = bytes.slice(offset);

    // Derive key
    const aesKey = await deriveAesGcmKey(keyOrPassword, salt);

    // Decrypt
    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
          tagLength: 128
        },
        aesKey,
        ciphertext as BufferSource
      );
    } catch {
      throw new Error('Decryption failed! Authentication tag mismatch or incorrect key.');
    }

    const decryptedBytes = new Uint8Array(decryptedBuffer);
    const view = new DataView(decryptedBytes.buffer);

    let unpackOffset = 0;
    const fnLen = view.getUint16(unpackOffset);
    unpackOffset += 2;

    const dec = new TextDecoder();
    const originalFileName = dec.decode(decryptedBytes.slice(unpackOffset, unpackOffset + fnLen));
    unpackOffset += fnLen;

    const mimeLen = view.getUint16(unpackOffset);
    unpackOffset += 2;

    const mimeType = dec.decode(decryptedBytes.slice(unpackOffset, unpackOffset + mimeLen));
    unpackOffset += mimeLen;

    const imageBytes = decryptedBytes.slice(unpackOffset);
    const blob = new Blob([imageBytes as BlobPart], { type: mimeType || 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    const endTime = performance.now();

    return {
      fileName: originalFileName || 'decrypted_image.png',
      mimeType: mimeType || detectMimeType(imageBytes),
      data: imageBytes,
      blobUrl,
      size: imageBytes.byteLength,
      decryptionTimeMs: Math.round(endTime - startTime)
    };
  } else {
    // Check for Legacy Desktop format (16 bytes salt + 16 bytes IV + AES-CBC ciphertext)
    if (bytes.length < 32 + 16) {
      throw new Error('Invalid file format. Does not match SECIMG or legacy encrypted format.');
    }

    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 32);
    const ciphertext = bytes.slice(32);

    const enc = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(keyOrPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const aesCbcKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 200000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-CBC', length: 256 },
      false,
      ['decrypt']
    );

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-CBC',
          iv: iv as BufferSource
        },
        aesCbcKey,
        ciphertext as BufferSource
      );
    } catch {
      throw new Error('Decryption failed! Incorrect key or corrupted file.');
    }

    const imageBytes = new Uint8Array(decryptedBuffer);
    const mimeType = detectMimeType(imageBytes);
    const ext = mimeType.split('/')[1] || 'png';
    const blob = new Blob([imageBytes as BlobPart], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const endTime = performance.now();

    const baseName = file.name.replace(/(_encrypted.*|\.[^/.]+)$/, '');

    return {
      fileName: `${baseName}_decrypted.${ext}`,
      mimeType,
      data: imageBytes,
      blobUrl,
      size: imageBytes.byteLength,
      decryptionTimeMs: Math.round(endTime - startTime)
    };
  }
}
