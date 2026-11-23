import { useState } from 'react';
import { AlertCircle, KeyRound, Unlock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';

export interface VaultUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRecovery?: () => void;
  onSuccess?: () => void;
}

export function VaultUnlockModal({
  isOpen,
  onClose,
  onOpenRecovery,
  onSuccess,
}: VaultUnlockModalProps) {
  const { user } = useAuth();
  const { unlock, isLoading, error } = useVaultStore();
  const [passphrase, setPassphrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!passphrase) return;
    if (!user) return;

    try {
      await unlock(passphrase, user.id);
      setPassphrase('');
      onClose();
      if (onSuccess) onSuccess();
    } catch {
      setLocalError('Incorrect vault passphrase. Please check your spelling.');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Unlock Encrypted Vault"
      description="Enter your local Vault Passphrase to derive your DEK and access your private memories."
    >
      <form onSubmit={(e) => void handleUnlock(e)} className="space-y-4">
        <div className="space-y-3">
          <Input
            label="Vault Passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter your vault passphrase"
            required
            autoFocus
            autoComplete="current-password"
          />
        </div>

        {(localError || error) && (
          <div className="p-2.5 bg-destructive-subtle text-destructive border border-destructive/20 rounded text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{localError || error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {onOpenRecovery ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenRecovery();
              }}
              className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Forgot Passphrase?</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading} className="gap-1.5">
              <Unlock className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Unlock Vault</span>
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
