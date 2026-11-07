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
  ShieldCheck,
  ExternalLink,
  KeyRound
} from 'lucide-react';
import { EncryptionResult, LogEntry } from '../types/crypto';
import { formatBytes, downloadBlob } from '../utils/fileHelpers';
import {
  requestGmailAccessToken,
  createGmailMimeMessage,
  sendViaGmailApi,
  loadGoogleIdentityScript
} from '../utils/gmailService';

interface ShareCardProps {
  shareData?: EncryptionResult | null;
  onAddLog: (type: LogEntry['type'], message: string) => void;
  onNavigateToEncrypt?: () => void;
}

export const ShareCard: React.FC<ShareCardProps> = ({
  shareData,
  onAddLog,
}) => {
  // Exactly 3 Email Input Fields State
  const [senderEmail, setSenderEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [receiverEmail, setReceiverEmail] = useState('');

  // Attached File State
  const [customFile, setCustomFile] = useState<File | null>(null);

  // Status & Validation State
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ sender?: string; receiver?: string }>({});

  // Google OAuth 2.0 State (Sender's Own Gmail Account)
  const defaultClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const [googleClientId, setGoogleClientId] = useState<string>(() => {
    return localStorage.getItem('image_encryptor_google_client_id') || defaultClientId;
  });
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [authorizedSender, setAuthorizedSender] = useState<string | null>(null);
  const [showOauthSettings, setShowOauthSettings] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(googleClientId);

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

  // Pre-load Google Identity script in background
  useEffect(() => {
    loadGoogleIdentityScript().catch(() => {});
  }, []);

  const handleSaveGoogleClientId = () => {
    const cleaned = clientIdInput.trim();
    setGoogleClientId(cleaned);
    localStorage.setItem('image_encryptor_google_client_id', cleaned);
    setShowOauthSettings(false);
    onAddLog('info', `Google OAuth Client ID saved: ${cleaned ? cleaned.substring(0, 16) + '...' : '(cleared)'}`);
  };

  // Obtains a valid Gmail OAuth access token via Google official consent popup
  const acquireGmailToken = async (senderHint: string): Promise<string> => {
    const activeClientId = googleClientId.trim();
    if (!activeClientId) {
      setShowOauthSettings(true);
      throw new Error(
        'Google OAuth Client ID is required to send emails directly from your Gmail account.\n\n' +
        'Please enter your Google Client ID in the "Gmail OAuth Settings" below.'
      );
    }

    // Check if current memory token is still active (with 60-second grace window)
    if (oauthToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
      return oauthToken;
    }

    onAddLog('info', 'Requesting Gmail authorization via Google OAuth...');
    const result = await requestGmailAccessToken(activeClientId, senderHint);
    setOauthToken(result.accessToken);
    setTokenExpiresAt(Date.now() + result.expiresIn * 1000);
    setAuthorizedSender(senderHint);
    onAddLog('success', `Gmail account authorized for: ${senderHint}`);
    return result.accessToken;
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // 1. Validate exactly 3 fields
    const errors: { sender?: string; receiver?: string } = {};
    const trimmedSender = senderEmail.trim();
    const trimmedReceiver = receiverEmail.trim();

    if (!trimmedSender) {
      errors.sender = 'Sender Email is required.';
    } else if (!validateEmail(trimmedSender)) {
      errors.sender = 'Please enter a valid Sender Email address (e.g. sender@gmail.com).';
    }

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

    setIsSending(true);

    try {
      // 3. Acquire Google OAuth access token for user's Gmail
      const token = await acquireGmailToken(trimmedSender);

      onAddLog('info', `Composing RFC 2822 encrypted message for ${trimmedReceiver}...`);

      // 4. Read encrypted attachment bytes in memory (never unencrypted)
      const arrayBuffer = await attachedBlob.arrayBuffer();
      const attachmentBytes = new Uint8Array(arrayBuffer);

      // 5. Build RFC 2822 multipart email with .secimg attachment (key excluded)
      const base64UrlMessage = createGmailMimeMessage({
        senderEmail: trimmedSender,
        receiverEmail: trimmedReceiver,
        personalMessage: personalMessage.trim(),
        attachmentFileName: attachedFileName,
        attachmentBytes
      });

      onAddLog('info', `Sending email via official Gmail API as ${trimmedSender}...`);

      // 6. Dispatch via official Gmail API
      const sendResult = await sendViaGmailApi(token, base64UrlMessage);

      setStatusMessage({
        type: 'success',
        text: `Email successfully dispatched from your Gmail account (${trimmedSender}) to ${trimmedReceiver}!\n\n` +
          `• Google Message ID: ${sendResult.messageId}\n` +
          `• Attachment: ${attachedFileName} (AES-256-GCM Encrypted)\n\n` +
          `Remember: The decryption key was NOT sent in the email. Please share it separately with the recipient.`
      });
      onAddLog('success', `Email dispatched via Gmail API (ID: ${sendResult.messageId})`);
    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred while sending the email.';
      
      // If token expired, clear from memory so next click prompts re-auth
      if (errorMsg.includes('expired') || errorMsg.includes('revoked')) {
        setOauthToken(null);
        setTokenExpiresAt(null);
      }

      setStatusMessage({
        type: 'error',
        text: errorMsg
      });
      onAddLog('error', `Gmail sending failed: ${errorMsg}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-dark-950 border border-dark-700 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header with Gmail OAuth Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-dark-800 pb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-red/10 border border-brand-red/30 rounded-lg text-brand-red">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Email Encrypted Image</h2>
            <p className="text-xs text-neutral-400">
              Sends the encrypted .secimg file directly from your own Gmail account via official Google OAuth
            </p>
          </div>
        </div>

        {/* Gmail OAuth Status Badge & Settings Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowOauthSettings(!showOauthSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition bg-dark-900 border-dark-700 hover:border-dark-600 text-neutral-300"
            title="Configure Google OAuth Client ID"
          >
            {oauthToken ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-medium">
                  Gmail Authorized {authorizedSender ? `(${authorizedSender})` : ''}
                </span>
              </>
            ) : googleClientId ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-neutral-300">Gmail OAuth Ready</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-300">Set Google Client ID</span>
              </>
            )}
            <Settings className="w-3.5 h-3.5 ml-1 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Expandable Google OAuth Settings Drawer */}
      {showOauthSettings && (
        <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5 text-sm">
              <Settings className="w-4 h-4 text-brand-red" />
              Google Cloud OAuth Configuration
            </span>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-red hover:text-white flex items-center gap-1 transition text-[11px]"
            >
              <span>Google Cloud Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-neutral-400 leading-relaxed">
            Emails are sent directly from your own Gmail account through Google's official OAuth 2.0. 
            To enable this, enter your <strong>Web Application OAuth 2.0 Client ID</strong> from your Google Cloud project below. 
            No Client Secret or password is required or stored.
          </p>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-neutral-300 block uppercase tracking-wider">
              Google OAuth Client ID:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                className="flex-1 px-3 py-2 bg-dark-950 border border-dark-700 rounded text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-brand-red"
              />
              <button
                type="button"
                onClick={handleSaveGoogleClientId}
                className="px-4 py-2 bg-brand-red hover:bg-brand-red-hover text-white font-medium rounded transition"
              >
                Save
              </button>
            </div>
            <div className="text-[11px] text-neutral-500 space-y-1 pt-1">
              <p>• Make sure to add this website's URL (e.g. <code className="text-amber-300 bg-dark-950 px-1 py-0.5 rounded">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code>) under <strong>Authorized JavaScript origins</strong> in Google Cloud Console.</p>
              <p>• Enable the <strong>Gmail API</strong> in your Google Cloud Project APIs library.</p>
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

      {/* Email Form: EXACTLY 3 INPUT FIELDS */}
      <form onSubmit={handleSendEmail} className="space-y-4">
        {/* Field 1: Sender Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between">
            <span>1. Sender Email</span>
            <span className="text-[11px] text-neutral-400 font-normal">Your Gmail address (used for Google OAuth)</span>
          </label>
          <input
            type="email"
            value={senderEmail}
            onChange={(e) => {
              setSenderEmail(e.target.value);
              if (validationErrors.sender) setValidationErrors(prev => ({ ...prev, sender: undefined }));
            }}
            placeholder="e.g. yourname@gmail.com"
            className={`w-full px-4 py-2.5 bg-dark-900 border rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none font-mono ${
              validationErrors.sender
                ? 'border-red-500 focus:border-red-500'
                : 'border-dark-700 focus:border-brand-red'
            }`}
          />
          {validationErrors.sender && (
            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{validationErrors.sender}</span>
            </p>
          )}
        </div>

        {/* Field 2: Personal Message (Optional) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between">
            <span>2. Personal Message (Optional)</span>
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

        {/* Field 3: Receiver Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between">
            <span>3. Receiver Email</span>
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

        {/* Action Button: Send Encrypted Image via Gmail */}
        <button
          type="submit"
          disabled={isSending || !attachedBlob}
          className="w-full py-3.5 bg-brand-red hover:bg-brand-red-hover disabled:bg-dark-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-red/20 pt-3"
        >
          {isSending ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Authorizing & Sending via Gmail...</span>
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
