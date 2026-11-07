export interface EncryptedContainer {
  magic: string;
  version: number;
  mode: number;
  salt: Uint8Array;
  iv: Uint8Array;
  encryptedBytes: Uint8Array;
}

export interface DecryptedResult {
  fileName: string;
  mimeType: string;
  data: Uint8Array;
  blobUrl: string;
  size: number;
  decryptionTimeMs: number;
}

export interface EncryptionResult {
  fileName: string;
  originalSize: number;
  encryptedSize: number;
  containerBlob: Blob;
  downloadUrl: string;
  keyUsed: string;
  saltHex: string;
  ivHex: string;
  encryptionTimeMs: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export type ActiveTab = 'encrypt' | 'decrypt' | 'share';

