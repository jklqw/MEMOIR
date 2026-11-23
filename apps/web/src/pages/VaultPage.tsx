import { useMemo, useRef, useState } from 'react';
import {
  FileText,
  FolderLock,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { AttachmentPreview } from '../components/attachments/AttachmentPreview.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { VaultUnlockModal } from '../components/vault/VaultUnlockModal.js';
import { useAttachments, useStorageQuota, useUploadAttachment } from '../hooks/useAttachments.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function VaultPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isUnlocked, isInitialized } = useVaultStore();

  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'images' | 'documents'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: attachments = [], isLoading } = useAttachments({ isVaultItem: true });
  const { data: quota } = useStorageQuota();
  const uploadMutation = useUploadAttachment();

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    try {
      await uploadMutation.mutateAsync({
        file,
        isVaultItem: true,
      });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 100% Client-side local filtering across decrypted metadata
  const filteredAttachments = useMemo(() => {
    let result = attachments;

    if (filterType === 'images') {
      result = result.filter((a) => a.mimeType.startsWith('image/'));
    } else if (filterType === 'documents') {
      result = result.filter(
        (a) =>
          a.mimeType.includes('pdf') ||
          a.mimeType.includes('text') ||
          a.mimeType.includes('document') ||
          a.mimeType.includes('sheet'),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => a.originalFilename.toLowerCase().includes(q));
    }

    return result;
  }, [attachments, filterType, searchQuery]);

  const usedMb = quota ? (quota.usedBytes / (1024 * 1024)).toFixed(1) : '0';
  const quotaMb = quota ? (quota.quotaBytes / (1024 * 1024)).toFixed(0) : '250';
  const percentage = quota ? quota.percentage : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Private Vault</h1>
          <p className="text-xs text-ink-muted mt-1">
            Independently encrypted documents, private photos, and personal certificates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFile}
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.json,.zip,.doc,.docx"
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isUnlocked || uploadMutation.isPending}
            className="gap-2 text-xs"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Encrypting & Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Upload File</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 rounded-md bg-destructive-subtle border border-destructive/20 text-xs text-destructive flex items-center justify-between">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-destructive hover:opacity-80 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Vault Locked Banner */}
      {!isUnlocked && isInitialized && (
        <div className="p-4 rounded-lg bg-surface border border-accent/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-ink">Vault is locked</h4>
              <p className="text-[11px] text-ink-muted">
                Files are securely encrypted in cloud storage. Unlock your vault to decrypt file
                names and view previews.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setUnlockModalOpen(true)}
            className="text-xs shrink-0"
          >
            <Unlock className="w-3.5 h-3.5 mr-1" />
            Unlock
          </Button>
        </div>
      )}

      {/* Storage Quota Usage Bar */}
      <div className="p-4 rounded-lg border border-border bg-surface space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-ink">
            <HardDrive className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold">Encrypted Storage Quota</span>
          </div>
          <span className="font-mono text-ink-muted">
            {usedMb} MB / {quotaMb} MB ({percentage}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              percentage > 90 ? 'bg-destructive' : 'bg-accent'
            }`}
            style={{ width: `${Math.max(percentage, 1)}%` }}
          />
        </div>

        <p className="text-[10px] text-ink-subtle font-mono">
          Each account is allocated 250 MB of zero-knowledge encrypted object storage with a 10 MB
          per-file cap.
        </p>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filenames locally..."
            className="pl-9 pr-9 text-xs"
          />
          <Search className="w-4 h-4 text-ink-subtle absolute left-3 top-2.5 stroke-[1.5]" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer border ${
              filterType === 'all'
                ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted border-border hover:text-ink'
            }`}
          >
            All ({attachments.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('images')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer border ${
              filterType === 'images'
                ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted border-border hover:text-ink'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Photos</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('documents')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer border ${
              filterType === 'documents'
                ? 'bg-accent/15 text-accent border-accent/40 font-semibold'
                : 'bg-surface text-ink-muted border-border hover:text-ink'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Docs</span>
          </button>
        </div>
      </div>

      {/* Files Grid / Empty State */}
      {isLoading ? (
        <div className="py-16 text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto" />
          <p className="text-xs font-mono text-ink-muted">
            Decrypting private vault index in RAM...
          </p>
        </div>
      ) : filteredAttachments.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-border rounded-xl space-y-3">
          <FolderLock className="w-10 h-10 text-ink-subtle mx-auto stroke-[1.5]" />
          <h3 className="font-serif text-base font-semibold text-ink">
            {searchQuery ? 'No matching files found' : 'Private Vault is Empty'}
          </h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {searchQuery
              ? 'No decrypted files matched your search term.'
              : 'Store photos, IDs, medical records, and sensitive files. Each file is stripped of EXIF coordinates and encrypted under its own AES-256-GCM key.'}
          </p>
          {!searchQuery && isUnlocked && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-xs"
            >
              Upload First File
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredAttachments.map((item) => (
            <AttachmentPreview key={item.id} attachment={item} readOnly={false} />
          ))}
        </div>
      )}

      {/* Cryptographic Architecture Card */}
      <div className="p-4 rounded-xl border border-border/70 bg-surface/40 space-y-2 text-xs text-ink-muted font-mono">
        <div className="flex items-center gap-1.5 text-accent font-semibold">
          <ShieldCheck className="w-4 h-4 stroke-[1.5]" />
          <span>Private Vault Cryptographic Guarantees</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-ink-subtle">
          <li>
            <strong>Per-File Keys:</strong> Every file generates a fresh 256-bit AES-GCM FileKey,
            wrapped under your DEK with user/file context AAD.
          </li>
          <li>
            <strong>Metadata Privacy:</strong> Original filenames and MIME types are encrypted
            client-side. Cloud storage only sees random UUIDs (<code>{'{uuid}.enc'}</code>).
          </li>
          <li>
            <strong>EXIF Scrubbing:</strong> Camera serials, GPS coordinates, and capture dates are
            scrubbed before encryption.
          </li>
          <li>
            <strong>Zero Public Access:</strong> Ciphertext downloads enforce binary octet-stream
            headers with strict nosniff protection.
          </li>
        </ul>
      </div>

      {/* Vault Unlock Modal */}
      <VaultUnlockModal isOpen={unlockModalOpen} onClose={() => setUnlockModalOpen(false)} />
    </div>
  );
}
