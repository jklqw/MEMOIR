import { Download, Key, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button.js';

export function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Account & Vault Settings</h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage data portability, cryptographic keys, and account continuity.
        </p>
      </div>

      {/* Data Portability */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Download className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Data Portability & Encrypted Backups</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Export your entire encrypted archive (.memoir-backup.json) containing ciphertext
          envelopes, KDF parameters, and SHA-256 integrity manifest.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">
            Export Encrypted Backup
          </Button>
          <Button variant="secondary" size="sm">
            Restore from Backup
          </Button>
        </div>
      </div>

      {/* Passphrase Rotation */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Key className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Rotate Vault Passphrase</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Zero-reencryption rotation: Changing your Vault Passphrase only re-wraps the master DEK.
          Zero diary entries require re-encryption.
        </p>
        <Button variant="outline" size="sm">
          Change Vault Passphrase
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="p-5 bg-surface border border-destructive/20 rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
          <Trash2 className="w-4 h-4 stroke-[1.5]" />
          <span>Delete Account</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Permanent removal of account identity, encrypted memories, and private files. This action
          cannot be undone.
        </p>
        <Button variant="destructive" size="sm">
          Delete Memoir Account
        </Button>
      </div>
    </div>
  );
}
