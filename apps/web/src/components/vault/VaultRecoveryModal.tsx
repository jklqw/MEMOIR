import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';

export interface VaultRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function VaultRecoveryModal({ isOpen, onClose, onSuccess }: VaultRecoveryModalProps) {
  const { user } = useAuth();
  const { recoverVault, isLoading, error } = useVaultStore();

  const [step, setStep] = useState<'input' | 'new-kit'>('input');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const [freshRecoveryKey, setFreshRecoveryKey] = useState<string | null>(null);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const cleanKey = recoveryKey.trim().toUpperCase();
    if (cleanKey.length < 32) {
      setLocalError('Please enter a valid 256-bit Recovery Key.');
      return;
    }

    if (newPassphrase.length < 12) {
      setLocalError('New Vault Passphrase must be at least 12 characters.');
      return;
    }

    if (newPassphrase !== confirmPassphrase) {
      setLocalError('Passphrases do not match.');
      return;
    }

    if (!user) return;

    try {
      const result = await recoverVault(cleanKey, newPassphrase, user.id);
      setFreshRecoveryKey(result.newRecoveryKey);
      setStep('new-kit');
    } catch {
      setLocalError('Recovery failed. Please ensure the recovery key is spelled correctly.');
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!freshRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(freshRecoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadRecoveryKit = () => {
    if (!freshRecoveryKey || !user) return;
    const content = `=====================================================
MEMOIR ZERO-KNOWLEDGE RECOVERY KIT (ROTATED)
=====================================================
Account: ${user.email}
Recovered & Issued: ${new Date().toUTCString()}

NEW RECOVERY KEY:
${freshRecoveryKey}

IMPORTANT INSTRUCTIONS:
1. This new 256-bit Recovery Key replaces your old key. Destroy previous paper copies.
2. The Memoir server NEVER receives or stores your Vault Passphrase or Recovery Key.
3. Keep this paper document in a safe, physical lockbox, or encrypted password manager.
=====================================================`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `memoir-recovery-kit-${user.email.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    if (!hasConfirmedBackup) return;
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (step === 'new-kit' && !hasConfirmedBackup) return;
        onClose();
      }}
      title={step === 'input' ? 'Emergency Vault Recovery' : 'New Master Recovery Kit'}
      description={
        step === 'input'
          ? 'Enter your 256-bit emergency recovery key to unlock your DEK and establish a new Vault Passphrase.'
          : 'Save your newly generated recovery key. Your old recovery key has been retired.'
      }
    >
      {step === 'input' ? (
        <form onSubmit={(e) => void handleRecover(e)} className="space-y-4">
          <div className="space-y-3">
            <Input
              label="Recovery Key"
              type="text"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="e.g. 7XQ9-4KJ2-M9PW-TR5V-..."
              required
              autoFocus
              className="font-mono uppercase tracking-wider"
            />

            <Input
              label="New Vault Passphrase"
              type="password"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              placeholder="At least 12 characters"
              required
              minLength={12}
              autoComplete="new-password"
            />

            <Input
              label="Confirm New Vault Passphrase"
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm new passphrase"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </div>

          {(localError || error) && (
            <div className="p-2.5 bg-destructive-subtle text-destructive border border-destructive/20 rounded text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading} className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Recover Vault</span>
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="p-4 bg-surface border border-accent/30 rounded-lg text-center space-y-3 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-widest text-accent font-semibold block">
              New 256-Bit Emergency Recovery Key
            </span>
            <div className="font-mono text-base md:text-lg font-bold tracking-wider text-ink select-all break-all bg-canvas/90 py-3 px-4 rounded border border-border">
              {freshRecoveryKey}
            </div>
            <p className="text-[11px] text-ink-subtle">
              Crockford Base32 with Modulo-37 Checksum · Case-insensitive
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleCopyRecoveryKey()}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
                  <span>Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span>Copy Key</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDownloadRecoveryKit}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Save Text File</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Print Kit</span>
            </Button>
          </div>

          <div className="p-3 bg-destructive-subtle border border-destructive/20 rounded-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5 stroke-[1.5]" />
            <div className="text-xs space-y-1 text-ink">
              <p className="font-semibold text-destructive">Single-Use Recovery Rotation</p>
              <p className="text-ink-muted">
                Your previous recovery key was retired. Please destroy old paper notes and keep this
                new document secure.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 bg-canvas border border-border rounded-md cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasConfirmedBackup}
              onChange={(e) => setHasConfirmedBackup(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-xs text-ink leading-relaxed">
              I have saved my new Recovery Key and understand that the previous key is no longer
              valid.
            </span>
          </label>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleFinish}
              disabled={!hasConfirmedBackup}
              className="w-full sm:w-auto"
            >
              Complete Vault Recovery
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
