import React, { useState, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Key,
  Copy,
  Download,
  Check,
  RefreshCw,
  Lock,
  Save,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  Mail
} from 'lucide-react';
import { EncryptionResult, LogEntry } from '../types/crypto';
import { encryptImage, generateSecureKey, validatePasswordStrength } from '../utils/webCrypto';
import { formatBytes, downloadBlob, readFileAsDataURL } from '../utils/fileHelpers';

interface EncryptCardProps {
  onAddLog: (type: LogEntry['type'], message: string) => void;
  onSetShareData?: (result: EncryptionResult) => void;
  onNavigateToShare?: () => void;
}

export const EncryptCard: React.FC<EncryptCardProps> = ({
  onAddLog,
  onSetShareData,
  onNavigateToShare
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isEncrypting, setIsEncrypting] = useState<boolean>(false);
  const [encryptionResult, setEncryptionResult] = useState<EncryptionResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onAddLog('error', `Rejected non-image file: ${file.name}`);
      alert('Please select a valid image file (PNG, JPEG, WebP, GIF, BMP).');
      return;
    }
    setSelectedFile(file);
    setEncryptionResult(null);
    try {
      const dataUrl = await readFileAsDataURL(file);
      setPreviewUrl(dataUrl);
      onAddLog('info', `Selected image: ${file.name} (${formatBytes(file.size)})`);
    } catch {
      onAddLog('warning', `Could not preview image: ${file.name}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleGenKey = (type: 16 | 24 | 32 | 'token') => {
    const key = generateSecureKey(type);
    setPassword(key);
    onAddLog('info', `Generated ${type === 'token' ? '256-bit URL-safe' : `${type}-character`} key.`);
  };

  const handleCopyKey = async () => {
    if (!password) {
      alert('Please generate or enter a password first.');
      return;
    }
    await navigator.clipboard.writeText(password);
    setCopiedKey(true);
    onAddLog('info', 'Password/Key copied to clipboard.');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSaveKeyToFile = () => {
    if (!password) {
      alert('No key to save.');
      return;
    }
    const blob = new Blob([password], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `decryption_key_${Date.now()}.txt`);
    onAddLog('info', 'Decryption key saved to file.');
  };

  const handleEncrypt = async () => {
    if (!selectedFile) {
      alert('Please select an image file to encrypt.');
      return;
    }
    if (!password) {
      alert('Please provide or generate a password/key.');
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      const proceed = window.confirm(
        `Notice: ${strength.message}\nDo you still wish to continue with this password?`
      );
      if (!proceed) return;
    }

    setIsEncrypting(true);
    onAddLog('info', `Starting AES-256-GCM encryption for ${selectedFile.name}...`);

    try {
      const result = await encryptImage(selectedFile, password);
      setEncryptionResult(result);
      if (onSetShareData) {
        onSetShareData(result);
      }
      onAddLog(
        'success',
        `Successfully encrypted ${selectedFile.name} -> ${result.fileName} in ${result.encryptionTimeMs}ms (${formatBytes(result.encryptedSize)})`
      );
    } catch (err: any) {
      onAddLog('error', `Encryption failed: ${err.message || err}`);
      alert(`Encryption failed: ${err.message || err}`);
    } finally {
      setIsEncrypting(false);
    }
  };

  return (
    <div className="bg-dark-950 border border-dark-700 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-dark-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-red/10 border border-brand-red/30 rounded-lg text-brand-red">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Encrypt Image</h2>
            <p className="text-xs text-neutral-400">
              AES-256-GCM Authenticated Encryption with PBKDF2 Key Derivation
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Select File */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 block">
          1. Select Image
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-brand-red bg-brand-red/5'
              : 'border-dark-700 hover:border-neutral-500 bg-dark-900/60'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            accept="image/*"
            className="hidden"
          />

          {previewUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={previewUrl}
                alt="Selected preview"
                className="max-h-48 max-w-full rounded-lg object-contain border border-dark-700 shadow-md"
              />
              <div className="text-xs text-neutral-300 font-medium">
                {selectedFile?.name} ({formatBytes(selectedFile?.size || 0)})
              </div>
              <span className="text-[11px] text-brand-red hover:underline">
                Click or drop another image to replace
              </span>
            </div>
          ) : (
            <div className="py-4">
              <div className="w-12 h-12 rounded-full bg-dark-800 border border-dark-700 mx-auto flex items-center justify-center text-neutral-400 mb-2">
                <Upload className="w-5 h-5 text-brand-red" />
              </div>
              <p className="text-sm font-medium text-white">
                Drag and drop your image here, or <span className="text-brand-red">browse</span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Supports PNG, JPEG, WebP, GIF, BMP (Unlimited size, processed entirely in browser)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Password / Key Settings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 block">
            2. Encryption Key / Passphrase
          </label>
          <span className="text-[11px] text-neutral-400">
            Never stored or sent anywhere
          </span>
        </div>

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter custom passphrase or use generator below..."
            className="w-full px-4 py-2.5 pr-20 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-red font-mono"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
            title={showPassword ? 'Hide Key' : 'Show Key'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Password Generator Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-neutral-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-brand-red" /> Generate:
          </span>
          <button
            type="button"
            onClick={() => handleGenKey(16)}
            className="px-2.5 py-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-neutral-200 transition"
          >
            16 chars
          </button>
          <button
            type="button"
            onClick={() => handleGenKey(24)}
            className="px-2.5 py-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-neutral-200 transition"
          >
            24 chars
          </button>
          <button
            type="button"
            onClick={() => handleGenKey(32)}
            className="px-2.5 py-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-neutral-200 transition"
          >
            32 chars
          </button>
          <button
            type="button"
            onClick={() => handleGenKey('token')}
            className="px-2.5 py-1 text-xs bg-brand-red/15 hover:bg-brand-red/25 border border-brand-red/40 rounded text-brand-red font-semibold transition"
          >
            256-bit Key
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyKey}
              className="px-2.5 py-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-neutral-200 flex items-center gap-1 transition"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? 'Copied!' : 'Copy Key'}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveKeyToFile}
              className="px-2.5 py-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded text-neutral-200 flex items-center gap-1 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save .txt</span>
            </button>
          </div>
        </div>
      </div>

      {/* Encrypt Action Button */}
      <button
        onClick={handleEncrypt}
        disabled={isEncrypting || !selectedFile || !password}
        className="w-full py-3.5 bg-brand-red hover:bg-brand-red-hover disabled:bg-dark-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20"
      >
        {isEncrypting ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Encrypting Image in Browser...</span>
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            <span>Encrypt Image (AES-256-GCM)</span>
          </>
        )}
      </button>

      {/* Encryption Result Output */}
      {encryptionResult && (
        <div className="bg-dark-900 border border-emerald-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Check className="w-5 h-5" />
              <span>Encryption Complete ({encryptionResult.encryptionTimeMs} ms)</span>
            </div>
            <span className="text-xs font-mono text-neutral-400">
              {formatBytes(encryptionResult.encryptedSize)}
            </span>
          </div>

          <div className="text-xs space-y-1 font-mono bg-dark-950 p-3 rounded-lg border border-dark-800 text-neutral-300">
            <div><span className="text-neutral-500">Output File:</span> {encryptionResult.fileName}</div>
            <div><span className="text-neutral-500">Algorithm:</span> AES-256-GCM (128-bit Tag, 250k PBKDF2)</div>
            <div><span className="text-neutral-500">Salt (Hex):</span> {encryptionResult.saltHex.slice(0, 16)}...</div>
            <div><span className="text-neutral-500">IV (Hex):</span> {encryptionResult.ivHex}</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => downloadBlob(encryptionResult.containerBlob, encryptionResult.fileName)}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition shadow-md shadow-emerald-900/20"
            >
              <Download className="w-4 h-4" />
              <span>Download Encrypted File (.secimg)</span>
            </button>
            {onNavigateToShare && (
              <button
                onClick={onNavigateToShare}
                className="py-2.5 px-4 bg-brand-red hover:bg-brand-red-hover text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition shadow-md shadow-brand-red/20"
              >
                <Mail className="w-4 h-4" />
                <span>Send via Email</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

