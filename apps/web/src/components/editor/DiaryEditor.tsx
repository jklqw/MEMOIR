import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Eye,
  Loader2,
  Lock,
  PenLine,
  Pin,
  Save,
  Tag,
  Unlock,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { DecryptedMemory } from '@memoir/shared';
import { useSaveMemory } from '../../hooks/useMemories.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';

export type AutosaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed' | 'offline';

export interface DiaryEditorProps {
  initialMemory?: DecryptedMemory | null;
  onSaved?: (memory: DecryptedMemory) => void;
  onOpenUnlock?: () => void;
}

export function DiaryEditor({ initialMemory, onSaved, onOpenUnlock }: DiaryEditorProps) {
  const { isUnlocked } = useVaultStore();
  const saveMemoryMutation = useSaveMemory();

  // Editor form state
  const [memoryId, setMemoryId] = useState<string | undefined>(initialMemory?.id);
  const [title, setTitle] = useState(initialMemory?.title ?? '');
  const [bodyMarkdown, setBodyMarkdown] = useState(initialMemory?.bodyMarkdown ?? '');
  const [entryDate, setEntryDate] = useState(
    initialMemory?.entryDate
      ? new Date(initialMemory.entryDate).toISOString().split('T')[0]!
      : new Date().toISOString().split('T')[0]!,
  );
  const [isPinned, setIsPinned] = useState(initialMemory?.isPinned ?? false);
  const [isTimeCapsule, setIsTimeCapsule] = useState(initialMemory?.isTimeCapsule ?? false);
  const [unlockAt, setUnlockAt] = useState<string>(
    initialMemory?.unlockAt ? new Date(initialMemory.unlockAt).toISOString().slice(0, 16) : '',
  );
  const [mood, setMood] = useState<string | null>(initialMemory?.mood ?? null);
  const [tags, setTags] = useState<string[]>(initialMemory?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  // Mode: write or preview
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');

  // Autosave state machine
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('saved');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  const moods = [
    {
      label: 'Peaceful',
      value: 'peaceful',
      color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Reflective',
      value: 'reflective',
      color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    },
    {
      label: 'Grateful',
      value: 'grateful',
      color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    },
    {
      label: 'Melancholy',
      value: 'melancholy',
      color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    },
    {
      label: 'Turbulent',
      value: 'turbulent',
      color: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    },
    {
      label: 'Focused',
      value: 'focused',
      color: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
    },
  ];

  // Core save function
  const executeSave = useCallback(async () => {
    if (!isUnlocked) return;
    if (!title.trim() && !bodyMarkdown.trim()) return;

    if (!navigator.onLine) {
      setAutosaveStatus('offline');
      return;
    }

    setAutosaveStatus('saving');

    try {
      const saved = await saveMemoryMutation.mutateAsync({
        id: memoryId,
        entryDate: new Date(entryDate).toISOString(),
        isPinned,
        isTimeCapsule,
        unlockAt: isTimeCapsule && unlockAt ? new Date(unlockAt).toISOString() : null,
        payload: {
          title,
          bodyMarkdown,
          mood,
          tags,
          schemaVersion: 1,
        },
      });

      if (!memoryId && saved.id) {
        setMemoryId(saved.id);
      }

      isDirtyRef.current = false;
      setAutosaveStatus('saved');
      if (onSaved) onSaved(saved);
    } catch {
      setAutosaveStatus('failed');
    }
  }, [
    isUnlocked,
    title,
    bodyMarkdown,
    memoryId,
    entryDate,
    isPinned,
    isTimeCapsule,
    unlockAt,
    mood,
    tags,
    saveMemoryMutation,
    onSaved,
  ]);

  // Debounced autosave watcher
  useEffect(() => {
    if (!isUnlocked) return;
    if (!isDirtyRef.current) return;

    setAutosaveStatus('unsaved');

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void executeSave();
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    title,
    bodyMarkdown,
    entryDate,
    isPinned,
    isTimeCapsule,
    unlockAt,
    mood,
    tags,
    isUnlocked,
    executeSave,
  ]);

  // Keyboard shortcut: Cmd/Ctrl + S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void executeSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeSave]);

  // Navigation guard on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const markDirty = () => {
    isDirtyRef.current = true;
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().toLowerCase().replace(/^#/, '');
      if (clean && !tags.includes(clean)) {
        setTags([...tags, clean]);
        markDirty();
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
    markDirty();
  };

  // Locked Vault Banner
  if (!isUnlocked) {
    return (
      <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-4">
        <Lock className="w-10 h-10 text-accent mx-auto stroke-[1.5]" />
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">Vault is Locked</h2>
          <p className="text-xs text-ink-muted mt-1 max-w-[40ch] mx-auto">
            Your encryption keys are zeroized in browser memory. Unlock your vault with your
            passphrase to compose or edit encrypted memories.
          </p>
        </div>
        {onOpenUnlock && (
          <Button onClick={onOpenUnlock} className="gap-2">
            <Unlock className="w-4 h-4 stroke-[1.5]" />
            <span>Unlock Vault</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Metadata and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border text-xs text-ink-muted">
        <div className="flex flex-wrap items-center gap-3">
          {/* Entry Date Picker */}
          <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-md border border-border">
            <Calendar className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
            <input
              type="date"
              value={entryDate}
              onChange={(e) => {
                setEntryDate(e.target.value);
                markDirty();
              }}
              className="bg-transparent border-none text-xs font-mono text-ink focus:outline-hidden cursor-pointer"
            />
          </div>

          {/* Pin Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsPinned(!isPinned);
              markDirty();
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors cursor-pointer ${
              isPinned
                ? 'bg-accent/10 border-accent text-accent font-medium'
                : 'bg-surface border-border text-ink-muted hover:text-ink'
            }`}
            title={isPinned ? 'Pinned to top of journal' : 'Pin to top of journal'}
          >
            <Pin className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>{isPinned ? 'Pinned' : 'Pin'}</span>
          </button>

          {/* Time Capsule Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsTimeCapsule(!isTimeCapsule);
              markDirty();
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors cursor-pointer ${
              isTimeCapsule
                ? 'bg-accent/10 border-accent text-accent font-medium'
                : 'bg-surface border-border text-ink-muted hover:text-ink'
            }`}
            title="Lock until a future date"
          >
            <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Time Capsule</span>
          </button>
        </div>

        {/* Right Status Indicator and Actions */}
        <div className="flex items-center gap-2.5">
          {/* Autosave Status Pill */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]" aria-live="polite">
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 text-accent animate-spin" />
                <span className="text-ink-muted">Encrypting...</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-accent stroke-[2]" />
                <span className="text-ink-subtle">Encrypted & Saved</span>
              </>
            )}
            {autosaveStatus === 'unsaved' && (
              <>
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-ink-muted">Unsaved</span>
              </>
            )}
            {autosaveStatus === 'failed' && (
              <button
                type="button"
                onClick={() => void executeSave()}
                className="flex items-center gap-1 text-destructive hover:underline cursor-pointer"
              >
                <AlertCircle className="w-3 h-3" />
                <span>Save Failed (Retry)</span>
              </button>
            )}
            {autosaveStatus === 'offline' && <span className="text-ink-subtle">Offline</span>}
          </div>

          {/* View Mode Toggle */}
          <div className="flex rounded-md border border-border p-0.5 bg-surface">
            <button
              type="button"
              onClick={() => setViewMode('write')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'write'
                  ? 'bg-canvas text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Write Mode"
            >
              <PenLine className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-canvas text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Sanitized Markdown Preview"
            >
              <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          </div>

          {/* Manual Save Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void executeSave()}
            disabled={autosaveStatus === 'saving'}
            className="h-7 text-xs gap-1 hidden sm:inline-flex"
            title="Save encrypted entry (Cmd/Ctrl + S)"
          >
            <Save className="w-3 h-3 stroke-[1.5]" />
            <span>Save</span>
          </Button>
        </div>
      </div>

      {/* Time Capsule Unlock Picker if enabled */}
      {isTimeCapsule && (
        <div className="p-3 bg-accent/5 border border-accent/20 rounded-md flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent stroke-[1.5]" />
            <span className="font-medium text-ink">Unlock At:</span>
            <input
              type="datetime-local"
              value={unlockAt}
              onChange={(e) => {
                setUnlockAt(e.target.value);
                markDirty();
              }}
              className="bg-surface border border-border rounded px-2 py-1 font-mono text-xs text-ink"
            />
          </div>
          <span className="text-[11px] text-ink-subtle">
            Ciphertext is withheld by server until this exact timestamp.
          </span>
        </div>
      )}

      {/* Mood Selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-subtle mr-1">Mood:</span>
        {moods.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              setMood(mood === m.value ? null : m.value);
              markDirty();
            }}
            className={`px-2.5 py-0.5 rounded-full text-xs transition-all duration-150 cursor-pointer ${
              mood === m.value
                ? `${m.color} font-medium border border-current shadow-xs`
                : 'bg-surface hover:bg-surface-hover text-ink-muted border border-border'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Private Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-ink-subtle stroke-[1.5]" />
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface border border-border font-mono text-ink"
          >
            <span>#{tag}</span>
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="text-ink-subtle hover:text-destructive cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          placeholder="+ Add private tag (Enter)"
          className="bg-transparent border-none outline-hidden text-xs font-mono text-ink placeholder:text-ink-subtle w-36"
        />
      </div>

      {/* Editorial Title Input */}
      <input
        type="text"
        placeholder="Untitled Memory"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          markDirty();
        }}
        className="w-full font-serif text-2xl sm:text-3xl text-ink font-semibold bg-transparent border-none outline-hidden placeholder:text-ink-subtle/60"
      />

      {/* Write / Preview Mode Area */}
      {viewMode === 'write' ? (
        <textarea
          placeholder="Pour your heart onto the archival page. Everything is padded to 256-byte boundaries and encrypted locally in RAM with AES-256-GCM..."
          value={bodyMarkdown}
          onChange={(e) => {
            setBodyMarkdown(e.target.value);
            markDirty();
          }}
          rows={16}
          className="w-full font-serif text-base text-ink bg-transparent border-none outline-hidden resize-none placeholder:text-ink-subtle/50 leading-relaxed min-h-[350px]"
        />
      ) : (
        <div className="prose prose-neutral dark:prose-invert max-w-none min-h-[350px] font-serif leading-relaxed text-ink p-4 bg-surface/30 rounded border border-border">
          {bodyMarkdown.trim() ? (
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{bodyMarkdown}</ReactMarkdown>
          ) : (
            <p className="text-xs font-mono text-ink-subtle italic">Empty memory</p>
          )}
        </div>
      )}
    </div>
  );
}
