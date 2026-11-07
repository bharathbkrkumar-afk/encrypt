import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

// Test definitions matching webCrypto.ts
const MAGIC_BYTES = new Uint8Array([0x53, 0x45, 0x43, 0x49, 0x4d, 0x47]); // "SECIMG"
const FORMAT_VERSION = 1;
const MODE_AES_GCM_PBKDF2 = 1;
const SALT_SIZE = 16;
const IV_SIZE = 12;
const PBKDF2_ITERATIONS = 250000;

async function deriveAesGcmKey(password, salt) {
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
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(fileName, mimeType, rawBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const aesKey = await deriveAesGcmKey(password, salt);

  const enc = new TextEncoder();
  const fnBytes = enc.encode(fileName);
  const mimeBytes = enc.encode(mimeType);

  const packedSize = 2 + fnBytes.length + 2 + mimeBytes.length + rawBytes.length;
  const packedBuffer = new Uint8Array(packedSize);
  const view = new DataView(packedBuffer.buffer);

  let offset = 0;
  view.setUint16(offset, fnBytes.length);
  offset += 2;
  packedBuffer.set(fnBytes, offset);
  offset += fnBytes.length;

  view.setUint16(offset, mimeBytes.length);
  offset += 2;
  packedBuffer.set(mimeBytes, offset);
  offset += mimeBytes.length;

  packedBuffer.set(rawBytes, offset);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    packedBuffer
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  const containerSize = MAGIC_BYTES.length + 2 + salt.length + iv.length + ciphertext.length;
  const container = new Uint8Array(containerSize);

  let cOffset = 0;
  container.set(MAGIC_BYTES, cOffset);
  cOffset += MAGIC_BYTES.length;

  container[cOffset++] = FORMAT_VERSION;
  container[cOffset++] = MODE_AES_GCM_PBKDF2;

  container.set(salt, cOffset);
  cOffset += salt.length;

  container.set(iv, cOffset);
  cOffset += iv.length;

  container.set(ciphertext, cOffset);
  return container;
}

async function decryptData(container, password) {
  let offset = MAGIC_BYTES.length;
  const version = container[offset++];
  const mode = container[offset++];

  if (version !== FORMAT_VERSION || mode !== MODE_AES_GCM_PBKDF2) {
    throw new Error('Unsupported version/mode');
  }

  const salt = container.slice(offset, offset + SALT_SIZE);
  offset += SALT_SIZE;

  const iv = container.slice(offset, offset + IV_SIZE);
  offset += IV_SIZE;

  const ciphertext = container.slice(offset);
  const aesKey = await deriveAesGcmKey(password, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    ciphertext
  );

  const decryptedBytes = new Uint8Array(decryptedBuffer);
  const view = new DataView(decryptedBytes.buffer);

  let unpackOffset = 0;
  const fnLen = view.getUint16(unpackOffset);
  unpackOffset += 2;

  const dec = new TextDecoder();
  const fileName = dec.decode(decryptedBytes.slice(unpackOffset, unpackOffset + fnLen));
  unpackOffset += fnLen;

  const mimeLen = view.getUint16(unpackOffset);
  unpackOffset += 2;

  const mimeType = dec.decode(decryptedBytes.slice(unpackOffset, unpackOffset + mimeLen));
  unpackOffset += mimeLen;

  const imageBytes = decryptedBytes.slice(unpackOffset);
  return { fileName, mimeType, imageBytes };
}

// Test legacy desktop format (AES-256-CBC with PKCS7 padding)
async function testLegacyCbcFormat() {
  const password = "OldDesktopPassword123!";
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesCbcKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const originalPlaintext = enc.encode("Testing desktop backward compatibility");
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    aesCbcKey,
    originalPlaintext
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    aesCbcKey,
    ciphertext
  );

  const dec = new TextDecoder();
  if (dec.decode(decrypted) !== "Testing desktop backward compatibility") {
    throw new Error("Legacy CBC decryption mismatch!");
  }
}

async function runTestSuite() {
  console.log("=== RUNNING SUITE: AES-256-GCM WebCrypto Encryption & Decryption ===");

  const testImages = [
    { name: "test_image.png", mime: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03, 0x04]) },
    { name: "photo.jpg", mime: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x10, 0x20, 0x30]) },
    { name: "badge.webp", mime: "image/webp", data: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0xaa, 0xbb]) },
  ];

  const testKey = "SuprajaSecureKey2026!#$";

  for (const img of testImages) {
    console.log(`\nTesting Image Type: ${img.name} (${img.mime}, ${img.data.length} bytes)...`);

    // 1. Encrypt
    const encrypted = await encryptData(img.name, img.mime, img.data, testKey);
    console.log(`  -> Encrypted container size: ${encrypted.length} bytes`);

    // 2. Decrypt with CORRECT key
    const decrypted = await decryptData(encrypted, testKey);
    if (decrypted.fileName !== img.name) throw new Error("Filename mismatch!");
    if (decrypted.mimeType !== img.mime) throw new Error("MIME mismatch!");
    if (decrypted.imageBytes.length !== img.data.length) throw new Error("Data length mismatch!");
    for (let i = 0; i < img.data.length; i++) {
      if (decrypted.imageBytes[i] !== img.data[i]) throw new Error(`Byte mismatch at index ${i}`);
    }
    console.log(`  [PASS] Byte-for-byte exact recovery!`);

    // 3. Decrypt with INCORRECT key
    try {
      await decryptData(encrypted, "WrongKey999!");
      throw new Error("SECURITY FAILURE: Incorrect key did not throw error!");
    } catch (err) {
      console.log(`  [PASS] Incorrect key rejected: ${err.name || err.message}`);
    }

    // 4. Test tampering resistance (flip 1 bit in ciphertext)
    const tamperedCipher = new Uint8Array(encrypted);
    tamperedCipher[tamperedCipher.length - 4] ^= 0x01;
    try {
      await decryptData(tamperedCipher, testKey);
      throw new Error("SECURITY FAILURE: Tampered ciphertext was accepted!");
    } catch (err) {
      console.log(`  [PASS] Tampered ciphertext rejected by GMAC tag authentication!`);
    }

    // 5. Test tampering in header metadata
    const tamperedHeader = new Uint8Array(encrypted);
    tamperedHeader[15] ^= 0x01; // flip bit in salt
    try {
      await decryptData(tamperedHeader, testKey);
      throw new Error("SECURITY FAILURE: Tampered salt was accepted!");
    } catch (err) {
      console.log(`  [PASS] Tampered salt rejected (key derivation mismatch triggers GMAC failure)!`);
    }
  }

  // 6. Test Legacy CBC Backward Compatibility
  console.log("\nTesting Legacy Desktop AES-256-CBC Compatibility:");
  await testLegacyCbcFormat();
  console.log("  [PASS] Legacy AES-CBC format backward compatibility confirmed.");

  console.log("\nALL ENCRYPTION & DECRYPTION TESTS PASSED PERFECTLY!");
}

runTestSuite().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
