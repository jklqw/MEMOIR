import { useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';

export interface PassphraseRotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PassphraseRotationModal({
  isOpen,
  onClose,
  onSuccess,
}: PassphraseRotationModalProps) {
  const { user } = useAuth();
  const { rotatePassphrase, isLoading, error } = useVaultStore();

  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

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
      await rotatePassphrase(newPassphrase, user.id);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setNewPassphrase('');
        setConfirmPassphrase('');
        onClose();
        if (onSuccess) onSuccess();
      }, 1500);
    } catch {
      setLocalError('Failed to rotate passphrase. Please try again.');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Rotate Vault Passphrase"
      description="Derives a new PassphraseKEK and re-wraps your DEK. Because entries are protected by your DEK, zero memories need re-encryption."
    >
      {isSuccess ? (
        <div className="p-6 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-accent mx-auto animate-bounce stroke-[1.5]" />
          <p className="text-sm font-semibold text-ink">Vault Passphrase Successfully Rotated</p>
          <p className="text-xs text-ink-muted">
            Your DEK was re-wrapped with a fresh salt and nonce. All memory ciphertexts remain
            secure.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => void handleRotate(e)} className="space-y-4">
          <div className="space-y-3">
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
              <RefreshCw className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Rotate Passphrase</span>
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
