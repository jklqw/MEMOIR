import { useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DeleteAccountResponse } from '@memoir/shared';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { api } from '../../lib/api.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { logout } = useAuth();
  const { lock } = useVaultStore();
  const navigate = useNavigate();

  const isConfirmationValid = confirmation.trim().toUpperCase() === 'DELETE MY ACCOUNT';
  const isFormValid = password.length > 0 && isConfirmationValid;

  const handleDelete = async () => {
    if (!isFormValid || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await api.delete<DeleteAccountResponse>('auth/account', {
        password,
        confirmation: confirmation.trim().toUpperCase(),
      });

      // Clear local in-memory keys
      lock();

      // Clear local auth session state
      await logout();

      // Navigate to landing page
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const errObj = err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      setError(
        errObj.response?.data?.error?.message ||
          errObj.message ||
          'Failed to delete account. Please verify your password.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setPassword('');
    setConfirmation('');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Memoir Account"
      description="Irreversible destruction of account identity, encrypted memories, and private files."
    >
      <div className="space-y-4 pt-1">
        {/* Warning Banner */}
        <div
          role="alert"
          className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Permanent Purge of All Encrypted Data</span>
          </div>
          <p className="leading-relaxed">
            All your diary entries, intimate thoughts, private attachments, and cryptographic vault
            keys will be immediately and irrevocably destroyed from the database and storage disks.
          </p>
        </div>

        {/* Honest Backup Retention Disclosure */}
        <div className="p-3 bg-surface border border-border rounded-md text-[11px] text-ink-muted space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <AlertTriangle className="w-3.5 h-3.5 text-ochre shrink-0" aria-hidden="true" />
            <span>Honest Retention Disclosure</span>
          </div>
          <p className="leading-relaxed">
            All live memories, vaults, attachments, and credentials are permanently purged
            immediately. Encrypted database snapshots are securely rotated and overwritten per our
            30-day disaster recovery retention schedule, after which zero residual traces exist.
          </p>
        </div>

        {/* Re-Authentication Password */}
        <div className="space-y-3">
          <Input
            label="Account Password (Re-Authentication)"
            type="password"
            placeholder="Enter your account password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isDeleting}
            autoComplete="current-password"
            required
          />

          {/* Explicit Confirmation Text */}
          <div className="space-y-1.5">
            <label
              htmlFor="delete-confirm-input"
              className="block text-xs font-medium tracking-wide text-ink-muted uppercase"
            >
              Type{' '}
              <span className="font-mono font-semibold text-destructive">DELETE MY ACCOUNT</span> to
              confirm
            </label>
            <Input
              id="delete-confirm-input"
              type="text"
              placeholder="DELETE MY ACCOUNT"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs text-destructive bg-destructive/10 p-2.5 rounded border border-destructive/20"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={!isFormValid || isDeleting}
            className="gap-2"
          >
            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            <span>Permanently Delete Account</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
