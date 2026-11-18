import React, { useState, useRef, useEffect } from 'react';
import {
  Mail,
  Send,
  Check,
  AlertCircle,
  AlertTriangle,
  Copy,
  FileCode,
  Upload,
  RefreshCw,
  Download,
  Settings,
  ExternalLink
} from 'lucide-react';
import { EncryptionResult, LogEntry } from '../types/crypto';
import { formatBytes, downloadBlob } from '../utils/fileHelpers';

interface ShareCardProps {
  shareData?: EncryptionResult | null;
  onAddLog: (type: LogEntry['type'], message: string) => void;
  onNavigateToEncrypt?: () => void;
}

export const ShareCard: React.FC<ShareCardProps> = ({
  shareData,
  onAddLog,
}) => {
  // Fixed System Sender Email (No user login or Google OAuth required)
  const FIXED_SENDER_EMAIL = 'encryptthreeiota@gmail.com';

  // Email Form State (Only Receiver Email & optional message needed from user)
  const [receiverEmail, setReceiverEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');

  // Attached File State
  const [customFile, setCustomFile] = useState<File | null>(null);

  // Status & Validation State
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ receiver?: string }>({});

  // Backend Connectivity State (Centralized Gmail SMTP via FastAPI backend)
  const defaultEnvUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    const saved = localStorage.getItem('image_encryptor_api_url');
    if (saved) return saved.trim().replace(/\/+$/, '');
    if (defaultEnvUrl) return defaultEnvUrl;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return '';
    }
    return 'http://localhost:8000';
  });

  const [backendHealth, setBackendHealth] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(backendUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine current attached file
  const attachedFileName = customFile
    ? customFile.name
    : shareData
    ? shareData.fileName
    : null;

  const attachedFileSize = customFile
    ? formatBytes(customFile.size)
    : shareData
    ? formatBytes(shareData.encryptedSize)
    : null;

  const attachedBlob: Blob | File | null = customFile
    ? customFile
    : shareData
    ? shareData.containerBlob
    : null;

  const keyToShare = shareData?.keyUsed || '';

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleCopyKey = async () => {
    if (!keyToShare) {
      alert('No key available in current session. Encrypt an image first.');
      return;
    }
    await navigator.clipboard.writeText(keyToShare);
    setCopiedKey(true);
    onAddLog('info', 'Decryption key copied to clipboard.');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCustomFileSelect = (file: File) => {
    setCustomFile(file);
    setStatusMessage(null);
    onAddLog('info', `Attached custom encrypted file: ${file.name} (${formatBytes(file.size)})`);
  };

  const handleDownloadAttachment = () => {
    if (!attachedBlob) return;
    const name = attachedFileName || 'encrypted_image.secimg';
    downloadBlob(attachedBlob, name);
    onAddLog('info', `Downloaded encrypted image: ${name}`);
  };

  // Test backend connection & wake up Render if sleeping
  const checkBackendHealth = async (urlToCheck?: string) => {
    const target = (urlToCheck !== undefined ? urlToCheck : backendUrl).trim().replace(/\/+$/, '');
    if (!target) {
      setBackendHealth('offline');
      return;
    }

    setBackendHealth('checking');
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${target}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const ms = Math.round(performance.now() - startTime);
        setLatencyMs(ms);
        setBackendHealth('online');
        onAddLog('success', `Backend connected: ${target} (${ms}ms)`);
      } else {
        setBackendHealth('offline');
        onAddLog('warning', `Backend at ${target} responded with HTTP ${res.status}`);
      }
    } catch (err: any) {
      setBackendHealth('offline');
      const reason = err.name === 'AbortError' ? 'Connection timeout (server may be booting)' : err.message;
      onAddLog('warning', `Cannot reach backend at ${target} (${reason})`);
    }
  };

  // Check health on mount if backendUrl is configured
  useEffect(() => {
    if (backendUrl) {
      checkBackendHealth(backendUrl);
    }
  }, []);

  const handleSaveBackendUrl = () => {
    const cleaned = customUrlInput.trim().replace(/\/+$/, '');
    setBackendUrl(cleaned);
    localStorage.setItem('image_encryptor_api_url', cleaned);
    setShowSettings(false);
    checkBackendHealth(cleaned);
    onAddLog('info', `Backend API URL updated to: ${cleaned || '(empty)'}`);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // 1. Validate receiver email
    const errors: { receiver?: string } = {};
    const trimmedReceiver = receiverEmail.trim();

    if (!trimmedReceiver) {
      errors.receiver = 'Receiver Email is required.';
    } else if (!validateEmail(trimmedReceiver)) {
      errors.receiver = 'Please enter a valid Receiver Email address (e.g. recipient@example.com).';
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    // 2. Validate encrypted file attachment
    if (!attachedBlob || !attachedFileName) {
      alert('No encrypted image attached. Please encrypt an image first or select an encrypted .secimg file.');
      return;
    }

    const targetApi = backendUrl.trim().replace(/\/+$/, '');
    if (!targetApi) {
      setStatusMessage({
        type: 'error',
        text: 'Backend API URL is not configured. Please enter your Render backend URL in the "Backend Connection" settings below (e.g. https://your-service.onrender.com) or set VITE_API_URL in Vercel.'
      });
      setShowSettings(true);
      return;
    }

    // Mixed Content Guard
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && targetApi.startsWith('http://')) {
      setStatusMessage({
        type: 'error',
        text: `Mixed Content Security Block: This application is loaded over HTTPS (${window.location.origin}), but your configured Backend API URL uses insecure HTTP ("${targetApi}"). Modern browsers block this. Please use HTTPS (https://...) for your backend, or test locally.`
      });
      setShowSettings(true);
      return;
    }

    setIsSending(true);
    onAddLog('info', `Dispatching encrypted image to ${trimmedReceiver} from ${FIXED_SENDER_EMAIL}...`);

    try {
      // 3. Prepare zero-knowledge form payload (without decryption key)
      const formData = new FormData();
      formData.append('sender_email', FIXED_SENDER_EMAIL);
      formData.append('receiver_email', trimmedReceiver);
      formData.append('personal_message', personalMessage.trim());
      formData.append('filename', attachedFileName);
      formData.append('encrypted_file', attachedBlob, attachedFileName);

      // 4. Send to backend centralized dispatch endpoint
      const response = await fetch(`${targetApi}/api/share/email`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded: Maximum 5 emails per minute allowed. Please wait a moment before sending another image.');
        }
        throw new Error(data.detail || `Server returned error status ${response.status}`);
      }

      setStatusMessage({
        type: 'success',
        text: `Encrypted image successfully dispatched to ${trimmedReceiver}!\n\n` +
          `• Sent from: ${FIXED_SENDER_EMAIL}\n` +
          `• Attachment: ${attachedFileName} (AES-256-GCM Encrypted)\n\n` +
          `Remember: The decryption key was NOT sent in the email. Please share it separately with the recipient through a private channel.`
      });
      setBackendHealth('online');
      onAddLog('success', `Email dispatched to ${trimmedReceiver} from ${FIXED_SENDER_EMAIL}`);
    } catch (err: any) {
      const rawMsg = err.message || '';
      let friendlyText = rawMsg;

      if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg === 'Failed to fetch') {
        friendlyText = `Cannot reach backend API at "${targetApi}".\n\n` +
          `Common causes & solutions:\n` +
          `• Render Free Tier Cold Start: Services spin down after 15 min of inactivity. The first wake-up request takes 50–90 seconds. Please wait a moment and try again.\n` +
          `• Backend URL: Verify the URL is correct and active. You can update or test the URL in Backend Settings below.\n` +
          `• CORS: Ensure the backend allows requests from this domain.\n\n` +
          `You can also download the encrypted image directly below to send it with your regular email client.`;
        setBackendHealth('offline');
      }

      setStatusMessage({
        type: 'error',
        text: friendlyText
      });
      onAddLog('error', `Email sending error: ${rawMsg}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-dark-950 border border-dark-700 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header with Backend Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-dark-800 pb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-red/10 border border-brand-red/30 rounded-lg text-brand-red">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Email Encrypted Image</h2>
            <p className="text-xs text-neutral-400">
              Sends the encrypted .secimg file directly from encryptthreeiota@gmail.com
            </p>
          </div>
        </div>

        {/* Backend Status Badge & Settings Toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition bg-dark-900 border-dark-700 hover:border-dark-600 text-neutral-300"
            title="Configure Backend Connection"
          >
            {backendHealth === 'online' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-medium">Backend Ready</span>
                {latencyMs && <span className="text-[10px] text-neutral-500 font-mono">({latencyMs}ms)</span>}
              </>
            ) : backendHealth === 'checking' ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-300">Connecting...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-300">Backend Offline</span>
              </>
            )}
            <Settings className="w-3.5 h-3.5 ml-1 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Expandable Backend Connection Settings Drawer */}
      {showSettings && (
        <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5 text-sm">
              <Settings className="w-4 h-4 text-brand-red" />
              Backend Connection Settings
            </span>
            <button
              type="button"
              onClick={() => checkBackendHealth(customUrlInput)}
              className="text-brand-red hover:text-white flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Test Connection</span>
            </button>
          </div>

          <p className="text-neutral-400 leading-relaxed">
            Specify the FastAPI backend URL (e.g. your deployed Render service). All emails are sent through the backend's configured Gmail account (encryptthreeiota@gmail.com).
          </p>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-neutral-300 block uppercase tracking-wider">
              Backend Service URL:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                placeholder="https://image-encryptor-api.onrender.com"
                className="flex-1 px-3 py-2 bg-dark-950 border border-dark-700 rounded text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-brand-red"
              />
              <button
                type="button"
                onClick={handleSaveBackendUrl}
                className="px-4 py-2 bg-brand-red hover:bg-brand-red-hover text-white font-medium rounded transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automatically Attached File Status */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-brand-red">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
              Encrypted Attachment
            </span>
            {attachedFileName ? (
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{attachedFileName}</span>
                <span className="text-xs font-mono font-normal text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40">
                  {attachedFileSize} • AES-256-GCM
                </span>
              </div>
            ) : (
              <div className="text-xs text-neutral-400 italic">
                No encrypted file attached yet. Encrypt an image first or upload one below.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {attachedBlob && (
            <button
              type="button"
              onClick={handleDownloadAttachment}
              className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-600 rounded-lg text-xs font-medium text-neutral-300 hover:text-white transition flex items-center gap-1.5"
              title="Download encrypted file directly to your device"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .secimg</span>
            </button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleCustomFileSelect(e.target.files[0])}
            accept=".secimg,.enc,.encrypted,*/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-600 rounded-lg text-xs font-medium text-neutral-300 hover:text-white transition flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{attachedFileName ? 'Change File' : 'Select .secimg File'}</span>
          </button>
        </div>
      </div>

      {/* Zero-Knowledge Security Notice */}
      <div className="bg-dark-900/60 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-300 space-y-1">
          <strong className="text-white block font-semibold">
            Zero-Knowledge Security Rule
          </strong>
          <p>
            The decryption key is <strong>never attached or included in this email</strong>. 
            The receiver must obtain the decryption key separately through a secure channel (e.g. Signal, WhatsApp, SMS).
          </p>
        </div>
      </div>

      {/* Email Form: No Login Required, Sender Fixed as encryptthreeiota@gmail.com */}
      <form onSubmit={handleSendEmail} className="space-y-4">
        {/* Fixed Sender Information Banner */}
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Sender Email (Automated System Dispatcher)
              </span>
              <span className="text-xs sm:text-sm font-mono font-medium text-emerald-300">
                {FIXED_SENDER_EMAIL}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-neutral-400 font-medium px-2.5 py-1 rounded-full bg-dark-800 border border-dark-700">
            No Login Required
          </span>
        </div>

        {/* Receiver Email (Required) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between">
            <span>Receiver Email</span>
            <span className="text-[11px] text-neutral-400 font-normal">Intended recipient address</span>
          </label>
          <input
            type="email"
            value={receiverEmail}
            onChange={(e) => {
              setReceiverEmail(e.target.value);
              if (validationErrors.receiver) setValidationErrors(prev => ({ ...prev, receiver: undefined }));
            }}
            placeholder="e.g. recipient@example.com"
            className={`w-full px-4 py-2.5 bg-dark-900 border rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none font-mono ${
              validationErrors.receiver
                ? 'border-red-500 focus:border-red-500'
                : 'border-dark-700 focus:border-brand-red'
            }`}
          />
          {validationErrors.receiver && (
            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{validationErrors.receiver}</span>
            </p>
          )}
        </div>

        {/* Personal Message (Optional) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between">
            <span>Personal Message (Optional)</span>
            <span className="text-[11px] text-neutral-500 font-normal">Included in the email body</span>
          </label>
          <textarea
            value={personalMessage}
            onChange={(e) => setPersonalMessage(e.target.value)}
            rows={3}
            placeholder="Add an optional personal message to accompany the encrypted image..."
            className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-red resize-y"
          />
        </div>

        {/* Action Button: Send Encrypted Image */}
        <button
          type="submit"
          disabled={isSending || !attachedBlob}
          className="w-full py-3.5 bg-brand-red hover:bg-brand-red-hover disabled:bg-dark-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 pt-3"
        >
          {isSending ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Sending Encrypted Image...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Send Encrypted Image</span>
            </>
          )}
        </button>
      </form>

      {/* Success / Failure Status Banner with Direct Fallback */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex flex-col gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-red-950/40 border-red-800/60 text-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {statusMessage.type === 'success' ? (
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1.5 flex-1">
              <strong className="block font-semibold text-sm">
                {statusMessage.type === 'success' ? 'Email Dispatched Successfully' : 'Email Dispatch Notice'}
              </strong>
              <p className="whitespace-pre-line leading-relaxed">{statusMessage.text}</p>
            </div>
          </div>

          {/* Fallback Action when Error occurs and file is attached */}
          {statusMessage.type === 'error' && attachedBlob && (
            <div className="pt-2 border-t border-red-900/40 flex items-center justify-between flex-wrap gap-2">
              <span className="text-neutral-400 text-[11px]">
                Tip: You can always download the encrypted file and send it manually.
              </span>
              <button
                type="button"
                onClick={handleDownloadAttachment}
                className="px-3 py-1.5 bg-dark-900 hover:bg-dark-800 border border-red-800/80 rounded-lg text-xs font-medium text-white transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-brand-red" />
                <span>Download {attachedFileName || 'Encrypted File'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Out-Of-Band Key Sharing Quick Helper */}
      {keyToShare && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">
              Decryption Key (Share Separately):
            </span>
            <button
              type="button"
              onClick={handleCopyKey}
              className="text-xs text-brand-red hover:text-white flex items-center gap-1 transition"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? 'Key Copied!' : 'Copy Key'}</span>
            </button>
          </div>
          <div className="px-3 py-2 bg-dark-950 border border-dark-800 rounded text-xs font-mono text-amber-300 break-all select-all">
            {keyToShare}
          </div>
          <p className="text-[11px] text-neutral-400">
            Send this key to {receiverEmail.trim() || 'the recipient'} via a separate channel (SMS, Signal, or WhatsApp).
          </p>
        </div>
      )}
    </div>
  );
};
