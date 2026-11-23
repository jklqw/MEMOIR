import { FolderLock, Upload } from 'lucide-react';
import { Button } from '../components/ui/Button.js';

export function VaultPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Private Vault</h1>
          <p className="text-xs text-ink-muted mt-1">
            Independently encrypted documents, IDs, and personal photos.
          </p>
        </div>
        <Button size="sm" className="gap-2">
          <Upload className="w-3.5 h-3.5 stroke-[1.5]" />
          <span>Upload File</span>
        </Button>
      </div>

      <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-2">
        <FolderLock className="w-8 h-8 text-ink-subtle mx-auto stroke-[1.5]" />
        <p className="text-sm font-medium text-ink">Private Vault is Empty</p>
        <p className="text-xs text-ink-muted">
          All files are stripped of EXIF metadata and encrypted with per-file AES-256-GCM keys.
        </p>
      </div>
    </div>
  );
}
