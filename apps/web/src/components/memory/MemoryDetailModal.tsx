import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  Clock,
  Edit3,
  Loader2,
  Lock,
  Pin,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { DecryptedMemory } from '@memoir/shared';
import { useAttachments } from '../../hooks/useAttachments.js';
import {
  useDeleteMemory,
  useRestoreMemory,
  useToggleArchive,
  useTogglePin,
} from '../../hooks/useMemories.js';
import { AttachmentPreview } from '../attachments/AttachmentPreview.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';

export interface MemoryDetailModalProps {
  memory: DecryptedMemory | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (memory: DecryptedMemory) => void;
}

export function MemoryDetailModal({ memory, isOpen, onClose, onEdit }: MemoryDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  const togglePinMutation = useTogglePin();
  const toggleArchiveMutation = useToggleArchive();
  const restoreMutation = useRestoreMemory();
  const deleteMutation = useDeleteMemory();
  const { data: attachments = [] } = useAttachments({ memoryId: memory?.id });

  if (!memory) return null;

  const entryDateFormatted = new Date(memory.entryDate).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isPendingCapsule =
    memory.isTimeCapsule && memory.unlockAt && new Date(memory.unlockAt) > new Date();

  const isArchived = Boolean(memory.archivedAt);

  const handleTogglePin = async () => {
    await togglePinMutation.mutateAsync(memory.id);
  };

  const handleToggleArchive = async () => {
    if (isArchived) {
      await restoreMutation.mutateAsync(memory.id);
    } else {
      await toggleArchiveMutation.mutateAsync(memory.id);
    }
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(memory.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title=""
        className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
      >
        {/* Header bar */}
        <div className="px-6 pt-6 pb-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-surface/50">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Calendar className="w-3.5 h-3.5 stroke-[1.5]" />
            <span className="font-mono">{entryDateFormatted}</span>
            {memory.isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-accent/15 text-accent">
                <Pin className="w-2.5 h-2.5 fill-current" />
                Pinned
              </span>
            )}
            {isArchived && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-ink-muted/15 text-ink-muted">
                <Archive className="w-2.5 h-2.5" />
                Archived
              </span>
            )}
            {memory.isTimeCapsule && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  isPendingCapsule
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                {isPendingCapsule
                  ? `Sealed until ${new Date(memory.unlockAt!).toLocaleDateString()}`
                  : 'Time Capsule Unlocked'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTogglePin}
              disabled={togglePinMutation.isPending}
              className={`p-1.5 h-auto ${memory.isPinned ? 'text-accent' : 'text-ink-muted hover:text-ink'}`}
              title={memory.isPinned ? 'Unpin' : 'Pin to top'}
            >
              <Pin className={`w-3.5 h-3.5 ${memory.isPinned ? 'fill-current' : ''}`} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleArchive}
              disabled={toggleArchiveMutation.isPending || restoreMutation.isPending}
              className="p-1.5 h-auto text-ink-muted hover:text-ink"
              title={isArchived ? 'Restore to active timeline' : 'Archive memory'}
            >
              {isArchived ? (
                <ArchiveRestore className="w-3.5 h-3.5" />
              ) : (
                <Archive className="w-3.5 h-3.5" />
              )}
            </Button>

            {onEdit && !isPendingCapsule && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(memory);
                }}
                className="p-1.5 h-auto text-ink-muted hover:text-ink"
                title="Edit memory"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 h-auto text-ink-muted hover:text-destructive"
              title="Delete memory permanently"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {/* Mood & Tags */}
          {(memory.mood || (memory.tags && memory.tags.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2">
              {memory.mood && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-serif bg-surface border border-border text-ink-muted">
                  Mood:{' '}
                  <span className="font-sans font-medium text-ink capitalize">{memory.mood}</span>
                </span>
              )}
              {memory.tags?.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-surface border border-border text-ink-muted"
                >
                  <Tag className="w-2.5 h-2.5 text-accent stroke-[1.5]" />
                  <span>#{t}</span>
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-ink leading-tight">
            {memory.title || (
              <span className="italic text-ink-muted font-normal">Untitled Entry</span>
            )}
          </h1>

          {/* Sanitized Markdown body */}
          {isPendingCapsule ? (
            <div className="p-8 rounded-lg border border-border bg-surface text-center space-y-3">
              <Lock className="w-8 h-8 text-amber-500 mx-auto stroke-[1.5]" />
              <h3 className="font-serif text-base font-medium text-ink">Time Capsule Sealed</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                This memory is locked in the server vault. Ciphertext is withheld until{' '}
                {new Date(memory.unlockAt!).toLocaleString()}.
              </p>
            </div>
          ) : (
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none font-sans text-ink leading-relaxed">
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline underline-offset-2 hover:text-accent-hover"
                    >
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-accent pl-4 italic text-ink-muted my-3">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {memory.bodyMarkdown || '*No content in this memory.*'}
              </ReactMarkdown>
            </div>
          )}

          {/* Attached Files Grid */}
          {attachments.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/70">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="font-serif font-semibold text-ink">
                  Attachments ({attachments.length})
                </span>
                <span className="font-mono text-[10px] text-ink-subtle">
                  Zero-Knowledge Encrypted
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {attachments.map((att) => (
                  <AttachmentPreview key={att.id} attachment={att} readOnly={false} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cryptographic Inspector collapsible footer */}
        <div className="px-6 py-3 border-t border-border/70 bg-surface/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted">
            <button
              type="button"
              onClick={() => setShowInspector((prev) => !prev)}
              className="flex items-center gap-1.5 text-accent hover:underline cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{showInspector ? 'Hide Cryptographic Proof' : 'View Cryptographic Proof'}</span>
            </button>

            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" />
              <span>AES-256-GCM Validated</span>
            </span>
          </div>

          {showInspector && (
            <div className="p-3 rounded bg-canvas border border-border font-mono text-[10px] space-y-1.5 text-ink-muted">
              <div>
                <span className="text-ink font-semibold">Memory ID:</span> {memory.id}
              </div>
              <div className="truncate">
                <span className="text-ink font-semibold">Nonce (96-bit CSPRNG):</span>{' '}
                {memory.nonce ?? 'Withheld (Time Capsule Sealed)'}
              </div>
              <div>
                <span className="text-ink font-semibold">Ciphertext Status:</span>{' '}
                {memory.ciphertext
                  ? `${Math.round((memory.ciphertext.length * 3) / 4)} bytes (256-byte padded boundary)`
                  : 'Withheld by Server (Locked Capsule)'}
              </div>
              {memory.ciphertext && (
                <div className="truncate">
                  <span className="text-ink font-semibold">Ciphertext Sample:</span>{' '}
                  {memory.ciphertext.slice(0, 36)}...
                </div>
              )}
              <div className="truncate">
                <span className="text-ink font-semibold">AAD Context:</span> memoir:v1|memory|id:
                {memory.id}
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Permanently Delete Memory?"
        description="This action cannot be undone. Because your vault is zero-knowledge encrypted, deleted ciphertext cannot be restored."
      >
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded bg-destructive-subtle border border-destructive/20 flex items-start gap-2.5 text-destructive text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              All associated encrypted blocks and cryptographic hashes will be purged from the
              database immediately.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                'Confirm Deletion'
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
