import { useState } from 'react';
import {
  AlertTriangle,
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

export interface VaultSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function VaultSetupModal({ isOpen, onClose, onSuccess }: VaultSetupModalProps) {
  const { user } = useAuth();
  const { setupVault, isLoading, error } = useVaultStore();

  const [step, setStep] = useState<'passphrase' | 'recovery-kit'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);

  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStartSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassphraseError(null);

    if (passphrase.length < 12) {
      setPassphraseError('Vault Passphrase must be at least 12 characters.');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match.');
      return;
    }

    if (!user) return;

    try {
      const result = await setupVault(passphrase, user.id);
      setGeneratedRecoveryKey(result.recoveryKey);
      setStep('recovery-kit');
    } catch {
      // Error handled by store
    }
  };

  const handleCopyRecoveryKey = async () => {
    if (!generatedRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(generatedRecoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard fallback
    }
  };

  const handlePrintRecoveryKit = () => {
    window.print();
  };

  const handleDownloadRecoveryKit = () => {
    if (!generatedRecoveryKey || !user) return;
    const content = `=====================================================
MEMOIR ZERO-KNOWLEDGE RECOVERY KIT
=====================================================
Account: ${user.email}
Created: ${new Date().toUTCString()}

RECOVERY KEY:
${generatedRecoveryKey}

IMPORTANT INSTRUCTIONS:
1. This 256-bit Recovery Key is the ONLY way to recover your encrypted memories if you forget your Vault Passphrase.
2. The Memoir server NEVER receives or stores your Vault Passphrase or Recovery Key.
3. Keep this paper document in a fireproof safe, bank deposit box, or physical lockbox.
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
        if (step === 'recovery-kit' && !hasConfirmedBackup) {
          // Prevent accidental dismiss before saving recovery key
          return;
        }
        onClose();
      }}
      title={step === 'passphrase' ? 'Initialize Your Encrypted Vault' : 'Your Master Recovery Kit'}
      description={
        step === 'passphrase'
          ? 'Set your independent Vault Passphrase. It encrypts your personal entries locally and is never sent to Memoir.'
          : 'Save your 256-bit emergency recovery key. This key is your only safeguard against lost passphrases.'
      }
    >
      {step === 'passphrase' ? (
        <form onSubmit={(e) => void handleStartSetup(e)} className="space-y-4">
          <div className="p-3 bg-accent/5 border border-accent/20 rounded-md flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-accent shrink-0 mt-0.5 stroke-[1.5]" />
            <div className="text-xs space-y-1">
              <p className="font-medium text-ink">Three-Secret Security Model</p>
              <p className="text-ink-muted">
                Your Vault Passphrase is separate from your account login password. It derives your
                local encryption key in browser memory using Argon2id and never leaves your device.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              label="Vault Passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 12 characters (passphrase or passphrase phrase)"
              required
              minLength={12}
              autoComplete="new-password"
            />

            <Input
              label="Confirm Vault Passphrase"
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm your passphrase exactly"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </div>

          {(passphraseError || error) && (
            <div className="p-2.5 bg-destructive-subtle text-destructive border border-destructive/20 rounded text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{passphraseError || error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Generate Keys & Continue
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="p-4 bg-surface border border-accent/30 rounded-lg text-center space-y-3 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-widest text-accent font-semibold block">
              256-Bit Emergency Recovery Key
            </span>
            <div className="font-mono text-base md:text-lg font-bold tracking-wider text-ink select-all break-all bg-canvas/90 py-3 px-4 rounded border border-border">
              {generatedRecoveryKey}
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
              onClick={handlePrintRecoveryKit}
              className="gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Print Kit</span>
            </Button>
          </div>

          <div className="p-3 bg-destructive-subtle border border-destructive/20 rounded-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5 stroke-[1.5]" />
            <div className="text-xs space-y-1 text-ink">
              <p className="font-semibold text-destructive">Crucial Zero-Knowledge Invariant</p>
              <p className="text-ink-muted">
                Memoir staff and servers do NOT have your keys or passphrases. If you forget your
                passphrase and lose this recovery key, your memories cannot be recovered by anyone.
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
              I have safely copied, downloaded, or printed my 256-bit Recovery Key and understand
              that nobody can restore my access without it.
            </span>
          </label>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleFinish}
              disabled={!hasConfirmedBackup}
              className="w-full sm:w-auto"
            >
              Complete Vault Setup
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
