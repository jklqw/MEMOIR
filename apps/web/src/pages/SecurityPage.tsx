import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PasskeyResponse, SessionResponse } from '@memoir/shared';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  QrCode,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';

interface TotpSetupResponse {
  qrCodeDataUrl: string;
  secret: string;
  backupCodes: string[];
}

export function SecurityPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser, registerPasskey, isPasskeySupported } = useAuth();
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 2FA Setup State
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [isEnabling2Fa, setIsEnabling2Fa] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // 2FA Disable State
  const [isDisabling2FaOpen, setIsDisabling2FaOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableTotpCode, setDisableTotpCode] = useState('');
  const [isSubmittingDisable, setIsSubmittingDisable] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Passkey State
  const [newPasskeyDeviceName, setNewPasskeyDeviceName] = useState('');
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<SessionResponse[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionResponse[]>('/api/v1/sessions'),
  });

  const {
    data: passkeys = [],
    isLoading: isPasskeysLoading,
    refetch: refetchPasskeys,
  } = useQuery<PasskeyResponse[]>({
    queryKey: ['passkeys'],
    queryFn: () => api.get<PasskeyResponse[]>('/api/v1/auth/passkeys'),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/api/v1/sessions/${sessionId}`),
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'Device session revoked successfully.' });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: unknown) => {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke session.',
      });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.post('/api/v1/sessions/revoke-all'),
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'All other device sessions have been revoked.' });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: unknown) => {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke other sessions.',
      });
    },
  });

  const deletePasskeyMutation = useMutation({
    mutationFn: (passkeyId: string) => api.delete(`/api/v1/auth/passkeys/${passkeyId}`),
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'Passkey removed successfully.' });
      void queryClient.invalidateQueries({ queryKey: ['passkeys'] });
    },
    onError: (err: unknown) => {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove passkey.',
      });
    },
  });

  // Start 2FA Setup
  const handleStartSetup = async () => {
    setActionMessage(null);
    setIsStartingSetup(true);
    try {
      const data = await api.post<TotpSetupResponse>('/api/v1/auth/2fa/setup');
      setSetupData(data);
      setSetupCode('');
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to initialize 2FA setup.',
      });
    } finally {
      setIsStartingSetup(false);
    }
  };

  // Confirm and Enable 2FA
  const handleConfirmEnable2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode.trim()) return;
    setActionMessage(null);
    setIsEnabling2Fa(true);
    try {
      await api.post('/api/v1/auth/2fa/enable', { token: setupCode.trim() });
      setSetupData(null);
      setSetupCode('');
      await refreshUser();
      setActionMessage({
        type: 'success',
        text: 'Two-factor authentication enabled successfully. Your backup codes are active.',
      });
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid 2FA code. Verification failed.',
      });
    } finally {
      setIsEnabling2Fa(false);
    }
  };

  // Disable 2FA
  const handleDisable2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableTotpCode.trim()) return;
    setActionMessage(null);
    setIsSubmittingDisable(true);
    try {
      await api.post('/api/v1/auth/2fa/disable', {
        currentPassword,
        totpCode: disableTotpCode.trim(),
      });
      setIsDisabling2FaOpen(false);
      setDisablePassword('');
      setDisableTotpCode('');
      await refreshUser();
      setActionMessage({
        type: 'success',
        text: 'Two-factor authentication disabled successfully.',
      });
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to disable 2FA. Verify your password and TOTP code.',
      });
    } finally {
      setIsSubmittingDisable(false);
    }
  };

  // Register Passkey
  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setIsRegisteringPasskey(true);
    try {
      await registerPasskey(newPasskeyDeviceName.trim() || undefined);
      setNewPasskeyDeviceName('');
      setIsRegisterModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      setActionMessage({
        type: 'success',
        text: 'Passkey enrolled successfully! You can now use it for biometric / security key sign-in.',
      });
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to register passkey with authenticator.',
      });
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);

    if (newPassword.length < 10) {
      setPasswordChangeError('New password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New password and confirmation do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.post('/api/v1/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActionMessage({
        type: 'success',
        text: 'Account password updated successfully. All other sessions have been terminated.',
      });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err: unknown) {
      setPasswordChangeError(
        err instanceof Error ? err.message : 'Failed to update account password.',
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const copyToClipboard = (text: string, onCopied: (val: boolean) => void) => {
    void navigator.clipboard.writeText(text);
    onCopied(true);
    setTimeout(() => onCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Security & Privacy Dashboard</h1>
        <p className="text-xs text-ink-muted mt-1">
          Cryptographic posture, active devices, and zero-knowledge identity controls.
        </p>
      </div>

      {actionMessage && (
        <div
          role="alert"
          aria-live="polite"
          className={`p-3 rounded-md border flex items-center justify-between text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline hover:no-underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Posture Checklist */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Shield className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Security Posture Checklist</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Zero-Knowledge Invariant</span>
              <span className="text-[11px] text-ink-muted">
                Plaintext memory strings and raw encryption keys never leave browser RAM
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Enforced
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Two-Factor Authentication (TOTP)</span>
              <span className="text-[11px] text-ink-muted">
                KMS AES-256-GCM encrypted secrets, SHA-256 hashed single-use backup codes
              </span>
            </div>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                user?.totpEnabled
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}
            >
              {user?.totpEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">WebAuthn Passkeys (FIDO2)</span>
              <span className="text-[11px] text-ink-muted">
                Hardware-bound biometric or security key authentication with server session
                isolation
              </span>
            </div>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                passkeys.length > 0
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}
            >
              {passkeys.length > 0 ? `${passkeys.length} Active` : 'Available'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Account Password Hash</span>
              <span className="text-[11px] text-ink-muted">
                Server-side memory-hard Argon2id (m=64MiB, t=3, p=4)
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Argon2id
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Session Security & Rotation</span>
              <span className="text-[11px] text-ink-muted">
                Opaque HttpOnly cookies, family rotation, and replay detection
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication Management */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <QrCode className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Two-Factor Authentication (TOTP)</span>
          </div>
          {user?.totpEnabled ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              Enabled & Protected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <ShieldAlert className="w-3.5 h-3.5" />
              Not Enabled
            </span>
          )}
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          Add an extra cryptographic barrier to your account using Time-based One-Time Passwords
          (RFC 6238). Authenticators such as Aegis, 1Password, or Google Authenticator are
          supported. Your TOTP secret is protected at rest with KMS AES-256-GCM envelope encryption.
        </p>

        {!user?.totpEnabled && !setupData && (
          <div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleStartSetup()}
              disabled={isStartingSetup}
            >
              {isStartingSetup ? 'Initializing Setup...' : 'Setup Two-Factor Authentication'}
            </Button>
          </div>
        )}

        {/* 2FA Enrollment Flow */}
        {!user?.totpEnabled && setupData && (
          <div className="mt-4 p-4 bg-paper border border-border rounded-md space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="text-sm font-medium text-ink">Step 1: Scan QR Code or Enter Secret</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Scan this code in your authenticator app, or manually enter the secret key below.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="p-2 bg-white rounded border border-border shadow-xs">
                <img
                  src={setupData.qrCodeDataUrl}
                  alt="Two-Factor QR Code"
                  className="w-40 h-40 object-contain"
                />
              </div>
              <div className="space-y-3 flex-1 text-xs">
                <div>
                  <label className="block text-ink-muted text-[11px] uppercase tracking-wider font-semibold mb-1">
                    Manual Secret Key
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="p-2 bg-surface border border-border rounded font-mono text-xs select-all text-ink">
                      {setupData.secret}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(setupData.secret, setCopiedSecret)}
                      className="text-xs"
                    >
                      {copiedSecret ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="p-3 bg-surface border border-border rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink text-[11px] uppercase tracking-wider">
                      Single-Use Backup Codes (10)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(setupData.backupCodes.join('\n'), setCopiedBackupCodes)
                      }
                      className="text-xs text-ink-muted"
                    >
                      {copiedBackupCodes ? 'Copied!' : 'Copy All'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    Save these codes in a secure vault. Each code can be used exactly once if you
                    lose access to your authenticator app.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink bg-paper p-2 rounded border border-border">
                    {setupData.backupCodes.map((c) => (
                      <span key={c} className="text-center">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleConfirmEnable2Fa}
              className="pt-3 border-t border-border space-y-3"
            >
              <div className="max-w-xs">
                <label htmlFor="setupTotpCode" className="block text-xs font-medium text-ink mb-1">
                  Step 2: Enter 6-digit Authenticator Code
                </label>
                <Input
                  id="setupTotpCode"
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  className="font-mono text-center tracking-widest text-sm"
                  autoComplete="one-time-code"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isEnabling2Fa || setupCode.length !== 6}
                >
                  {isEnabling2Fa ? 'Verifying...' : 'Activate 2FA'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSetupData(null);
                    setSetupCode('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* 2FA Disable Option */}
        {user?.totpEnabled && (
          <div className="space-y-3">
            {!isDisabling2FaOpen ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDisabling2FaOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
              >
                Disable Two-Factor Authentication
              </Button>
            ) : (
              <form
                onSubmit={handleDisable2Fa}
                className="p-4 bg-paper border border-red-200 dark:border-red-900/60 rounded-md space-y-4"
              >
                <div className="text-xs text-red-800 dark:text-red-300 font-medium">
                  Confirm 2FA Deactivation: Enter your account password and a current TOTP code or
                  backup code.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="disablePassword"
                      className="block text-xs font-medium text-ink mb-1"
                    >
                      Account Password
                    </label>
                    <Input
                      id="disablePassword"
                      type="password"
                      placeholder="••••••••••••"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="disableTotpCode"
                      className="block text-xs font-medium text-ink mb-1"
                    >
                      TOTP or Backup Code
                    </label>
                    <Input
                      id="disableTotpCode"
                      type="text"
                      placeholder="123456 or ABCD-1234"
                      value={disableTotpCode}
                      onChange={(e) => setDisableTotpCode(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmittingDisable || !disablePassword || !disableTotpCode}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isSubmittingDisable ? 'Disabling...' : 'Confirm Disable 2FA'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsDisabling2FaOpen(false);
                      setDisablePassword('');
                      setDisableTotpCode('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Passkeys & Biometric Logins */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Fingerprint className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Passkeys & Biometric Logins (WebAuthn / FIDO2)</span>
          </div>
          {isPasskeySupported && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchPasskeys()}
                title="Refresh passkeys list"
                className="text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsRegisterModalOpen(true)}
                className="text-xs"
              >
                <Fingerprint className="w-3.5 h-3.5 mr-1.5" />
                Register New Passkey
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          Authenticate quickly and securely with Touch ID, Face ID, Windows Hello, or a hardware
          security key. Passkeys replace traditional passwords with phishing-resistant public-key
          cryptography.
        </p>

        {/* Zero-Knowledge Vault Boundary callout */}
        <div className="p-3 rounded-md bg-paper border border-border text-[11px] leading-relaxed text-ink-muted flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            <strong>Zero-Knowledge Vault Boundary:</strong> In strict adherence to our Three-Secret
            Separation invariant, your Passkey authenticates your identity to establish an
            authorized server session only. Your encrypted diary entries and local vault files
            remain sealed until you enter your separate Vault Passphrase in browser RAM.
          </span>
        </div>

        {!isPasskeySupported && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400 rounded">
            Your current browser environment does not support WebAuthn / Passkeys.
          </div>
        )}

        {isRegisterModalOpen && (
          <form
            onSubmit={handleRegisterPasskey}
            className="p-4 bg-paper border border-border rounded-md space-y-3 max-w-md"
          >
            <div className="text-xs font-medium text-ink">Enroll New Passkey</div>
            <div>
              <label
                htmlFor="passkeyDeviceName"
                className="block text-xs font-medium text-ink mb-1"
              >
                Device Name / Label
              </label>
              <Input
                id="passkeyDeviceName"
                type="text"
                placeholder="e.g., MacBook Touch ID or YubiKey 5"
                value={newPasskeyDeviceName}
                onChange={(e) => setNewPasskeyDeviceName(e.target.value)}
                maxLength={100}
              />
              <p className="text-[11px] text-ink-muted mt-1">
                A prompt from your operating system or browser will appear to verify your identity.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={isRegisteringPasskey}>
                {isRegisteringPasskey ? 'Enrolling...' : 'Continue with Authenticator'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsRegisterModalOpen(false);
                  setNewPasskeyDeviceName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {isPasskeysLoading && (
          <div className="py-4 text-center text-xs text-ink-muted">
            Loading registered passkeys...
          </div>
        )}

        {!isPasskeysLoading && passkeys.length === 0 && (
          <p className="text-xs text-ink-muted py-2">
            No passkeys registered yet. Click &quot;Register New Passkey&quot; to enroll your device
            authenticator.
          </p>
        )}

        {!isPasskeysLoading && passkeys.length > 0 && (
          <div className="space-y-2.5">
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="p-3 bg-paper border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center text-ink shrink-0">
                    <Fingerprint className="w-4 h-4 text-accent" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-medium text-ink">{passkey.deviceName}</div>
                    <div className="flex items-center gap-3 text-ink-muted text-[11px] font-mono mt-0.5">
                      <span>Created: {new Date(passkey.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>
                        Last used:{' '}
                        {passkey.lastUsedAt
                          ? new Date(passkey.lastUsedAt).toLocaleString()
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletePasskeyMutation.isPending}
                  onClick={() => deletePasskeyMutation.mutate(passkey.id)}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 self-end sm:self-center"
                  title="Remove this passkey"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Password & Credential Lifecycle */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Account Password & Credential Lifecycle</span>
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          Update the password used to authenticate your session with the server.
        </p>

        <div className="p-3 rounded-md bg-paper border border-border text-[11px] leading-relaxed text-ink-muted flex items-start gap-2">
          <Lock className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            <strong>Three-Secret Separation:</strong> Changing your account password re-hashes your
            authentication credential via Argon2id on the server. Your encrypted diary entries,
            vault keys, and local Vault Passphrase remain completely unchanged.
          </span>
        </div>

        {passwordChangeError && (
          <div
            role="alert"
            aria-live="polite"
            className="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{passwordChangeError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-ink mb-1">
              Current Account Password
            </label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="••••••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-ink mb-1">
              New Account Password
            </label>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="text-[11px] text-ink-muted mt-1">Minimum 10 characters.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-ink mb-1">
              Confirm New Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {isChangingPassword ? 'Updating Password...' : 'Update Password'}
          </Button>
        </form>
      </div>

      {/* Active Sessions */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Laptop className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Active Sessions & Authorized Devices</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              title="Refresh session list"
              className="text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={revokeAllMutation.isPending || sessions.length <= 1}
              onClick={() => revokeAllMutation.mutate()}
              className="text-xs"
            >
              {revokeAllMutation.isPending ? 'Revoking...' : 'Revoke All Other Devices'}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="py-8 text-center text-xs text-ink-muted">
            <div className="w-5 h-5 border-2 border-border border-t-ink rounded-full animate-spin mx-auto mb-2" />
            Loading active sessions...
          </div>
        )}

        {isError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 rounded">
            Failed to load active device sessions.
          </div>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <p className="text-xs text-ink-muted py-4 text-center">No active sessions found.</p>
        )}

        {!isLoading && !isError && sessions.length > 0 && (
          <div className="space-y-2.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-3 bg-paper border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center text-ink shrink-0">
                    <Laptop className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{session.deviceLabel}</span>
                      {session.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent font-semibold">
                          This Browser
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-ink-muted text-[11px] font-mono mt-0.5">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" strokeWidth={1.5} />
                        {session.ipMasked}
                      </span>
                      <span>•</span>
                      <span>Last seen: {new Date(session.lastSeenAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(session.id)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 self-end sm:self-center"
                    title="Revoke session for this device"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
