import { ArrowLeft, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { DiaryEditor } from '../components/editor/DiaryEditor.js';
import { Button } from '../components/ui/Button.js';
import { useMemory } from '../hooks/useMemories.js';

export function JournalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const memoryId = searchParams.get('id') ?? undefined;

  const { data: memory, isLoading } = useMemory(memoryId);

  const handleStartNew = () => {
    setSearchParams({}, { replace: true });
  };

  if (memoryId && isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-xs font-mono text-ink-muted">Decrypting memory envelope locally...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {memoryId && (
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartNew}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink -ml-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>New Memory</span>
          </Button>

          <span className="text-[11px] font-mono text-ink-subtle">
            Editing {memory?.id.slice(0, 8)}...
          </span>
        </div>
      )}

      <DiaryEditor
        key={memoryId ?? 'new'}
        initialMemory={memoryId ? memory : null}
        onSaved={(saved) => {
          if (!memoryId && saved.id) {
            setSearchParams({ id: saved.id }, { replace: true });
          }
        }}
      />
    </div>
  );
}
