import { useEffect, useState } from 'react';
import {
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Trash2,
} from 'lucide-react';
import type { DecryptedAttachment } from '@memoir/shared';
import { useAuth } from '../../context/AuthContext.js';
import { useDeleteAttachment } from '../../hooks/useAttachments.js';
import { downloadAndDecryptAttachment } from '../../services/attachmentCryptoService.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';

export interface AttachmentPreviewProps {
  attachment: DecryptedAttachment;
  onDeleted?: () => void;
  readOnly?: boolean;
}

export function AttachmentPreview({
  attachment,
  onDeleted,
  readOnly = false,
}: AttachmentPreviewProps) {
  const { user } = useAuth();
  const { dek, isUnlocked } = useVaultStore();
  const deleteMutation = useDeleteAttachment();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = attachment.mimeType.startsWith('image/');

  // For image attachments: automatically decrypt in RAM and create object URL
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadPreview() {
      if (!isImage || !isUnlocked || !dek || !user) return;
      setIsDecrypting(true);
      setError(null);

      try {
        const { bytes, metadata } = await downloadAndDecryptAttachment(attachment, dek, user.id);
        if (!active) return;
        const blob = new Blob([bytes as unknown as BlobPart], { type: metadata.mimeType });
        createdUrl = URL.createObjectURL(blob);
        setImageUrl(createdUrl);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Decryption failed');
      } finally {
        if (active) setIsDecrypting(false);
      }
    }

    void loadPreview();

    return () => {
      active = false;
      // Invariant: Always revoke object URLs on unmount to free RAM
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [attachment.id, isImage, isUnlocked, dek, user]);

  const handleDownloadDecrypted = async () => {
    if (!isUnlocked || !dek || !user) return;
    setIsDownloading(true);

    try {
      const { bytes, metadata } = await downloadAndDecryptAttachment(attachment, dek, user.id);
      const blob = new Blob([bytes as unknown as BlobPart], { type: metadata.mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.originalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(attachment.id);
    onDeleted?.();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface overflow-hidden group">
      {/* Image Preview Container */}
      {isImage && (
        <div className="relative aspect-video w-full bg-canvas flex items-center justify-center overflow-hidden border-b border-border">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={attachment.originalFilename}
              className="w-full h-full object-cover"
            />
          ) : isDecrypting ? (
            <div className="flex flex-col items-center gap-1.5 text-ink-muted text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span className="font-mono text-[10px]">Decrypting in RAM...</span>
            </div>
          ) : !isUnlocked ? (
            <div className="flex flex-col items-center gap-1.5 text-ink-muted text-xs">
              <Lock className="w-5 h-5 text-accent stroke-[1.5]" />
              <span className="font-mono text-[10px]">Encrypted</span>
            </div>
          ) : (
            <ImageIcon className="w-8 h-8 text-ink-subtle" />
          )}
        </div>
      )}

      {/* File Info Bar */}
      <div className="p-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {!isImage && (
            <div className="w-8 h-8 rounded bg-canvas border border-border flex items-center justify-center shrink-0 text-accent">
              {attachment.mimeType.includes('pdf') ? (
                <FileText className="w-4 h-4" />
              ) : (
                <File className="w-4 h-4" />
              )}
            </div>
          )}

          <div className="min-w-0">
            <p className="font-medium text-ink truncate font-mono text-xs">
              {attachment.originalFilename}
            </p>
            <p className="text-[10px] text-ink-muted font-mono">
              {formatSize(attachment.originalSize || attachment.byteSize)} • AES-256-GCM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadDecrypted}
            disabled={!isUnlocked || isDownloading}
            className="p-1.5 h-auto text-ink-muted hover:text-ink"
            title="Download decrypted file"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </Button>

          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="p-1.5 h-auto text-ink-muted hover:text-destructive"
              title="Delete attachment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {error && <div className="px-3 pb-2 text-[10px] text-destructive">{error}</div>}
    </div>
  );
}
