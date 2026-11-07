import React, { useState, useRef } from 'react';
import {
  FileCode,
  Unlock,
  Key,
  Download,
  Check,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Image as ImageIcon
} from 'lucide-react';
import { DecryptedResult, LogEntry } from '../types/crypto';
import { decryptFile } from '../utils/webCrypto';
import { formatBytes, downloadBlob } from '../utils/fileHelpers';

interface DecryptCardProps {
  onAddLog: (type: LogEntry['type'], message: string) => void;
}

export const DecryptCard: React.FC<DecryptCardProps> = ({ onAddLog }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [decryptionResult, setDecryptionResult] = useState<DecryptedResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setDecryptionResult(null);
    setErrorMessage(null);
    onAddLog('info', `Selected encrypted file: ${file.name} (${formatBytes(file.size)})`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDecrypt = async () => {
    if (!selectedFile) {
      alert('Please select an encrypted file to decrypt.');
      return;
    }
    if (!password) {
      alert('Please enter the decryption key / password.');
      return;
    }

    setIsDecrypting(true);
    setErrorMessage(null);
    onAddLog('info', `Decrypting ${selectedFile.name}...`);

    try {
      const result = await decryptFile(selectedFile, password);
      setDecryptionResult(result);
      onAddLog(
        'success',
        `Successfully decrypted -> ${result.fileName} in ${result.decryptionTimeMs}ms (${formatBytes(result.size)})`
      );
    } catch (err: any) {
      const msg = err.message || 'Decryption failed. Please verify your decryption key.';
      setErrorMessage(msg);
      onAddLog('error', `Decryption failed: ${msg}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="bg-dark-950 border border-dark-700 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-dark-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-200">
            <Unlock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Decrypt Image</h2>
            <p className="text-xs text-neutral-400">
              Compatible with modern AES-256-GCM (.secimg) & legacy Python AES-CBC files
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Select Encrypted File */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 block">
          1. Select Encrypted File
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-brand-red bg-brand-red/5'
              : 'border-dark-700 hover:border-neutral-500 bg-dark-900/60'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            accept=".secimg,.enc,.encrypted,*/*"
            className="hidden"
          />

          <div className="w-12 h-12 rounded-full bg-dark-800 border border-dark-700 mx-auto flex items-center justify-center text-neutral-400">
            <FileCode className="w-5 h-5 text-neutral-300" />
          </div>

          {selectedFile ? (
            <div>
              <div className="text-sm font-semibold text-white">{selectedFile.name}</div>
              <div className="text-xs text-neutral-400 mt-0.5">
                Size: {formatBytes(selectedFile.size)}
              </div>
              <span className="text-[11px] text-brand-red hover:underline block mt-2">
                Click to choose a different file
              </span>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-white">
                Drag and drop your encrypted file here, or <span className="text-brand-red">browse</span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Accepts .secimg, .enc, or legacy .encrypted files
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Decryption Key */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 block">
          2. Enter Decryption Key / Passphrase
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Paste the secret key or passphrase shared by the sender..."
            className="w-full px-4 py-2.5 pr-12 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-red font-mono"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Decrypt Action Button */}
      <button
        onClick={handleDecrypt}
        disabled={isDecrypting || !selectedFile || !password}
        className="w-full py-3.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-dark-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 border border-neutral-700 shadow-lg"
      >
        {isDecrypting ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Verifying Auth Tag & Decrypting...</span>
          </>
        ) : (
          <>
            <Unlock className="w-5 h-5" />
            <span>Decrypt Image</span>
          </>
        )}
      </button>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-red-200">
            <strong className="block font-semibold mb-0.5 text-red-300">Authentication Error</strong>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Decryption Result */}
      {decryptionResult && (
        <div className="bg-dark-900 border border-emerald-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Check className="w-5 h-5" />
              <span>Decryption Successful! ({decryptionResult.decryptionTimeMs} ms)</span>
            </div>
            <span className="text-xs text-neutral-400">
              {formatBytes(decryptionResult.size)} • {decryptionResult.mimeType}
            </span>
          </div>

          {/* Decrypted Image Preview */}
          <div className="flex flex-col items-center justify-center bg-dark-950 p-4 rounded-xl border border-dark-800">
            <img
              src={decryptionResult.blobUrl}
              alt="Decrypted preview"
              className="max-h-72 max-w-full rounded-lg object-contain shadow-md"
            />
            <div className="text-xs text-neutral-400 mt-2 font-mono">
              {decryptionResult.fileName}
            </div>
          </div>

          <button
            onClick={() => {
              const blob = new Blob([decryptionResult.data as BlobPart], { type: decryptionResult.mimeType });
              downloadBlob(blob, decryptionResult.fileName);
            }}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition shadow-md shadow-emerald-900/20"
          >
            <Download className="w-4 h-4" />
            <span>Download Decrypted Image</span>
          </button>
        </div>
      )}
    </div>
  );
};
