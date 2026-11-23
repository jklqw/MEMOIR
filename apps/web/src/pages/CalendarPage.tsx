import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Lock,
  PenLine,
  Pin,
  Tag,
  Unlock,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { DecryptedMemory } from '@memoir/shared';
import { MemoryDetailModal } from '../components/memory/MemoryDetailModal.js';
import { Button } from '../components/ui/Button.js';
import { VaultUnlockModal } from '../components/vault/VaultUnlockModal.js';
import { useMemoriesList } from '../hooks/useMemories.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function CalendarPage() {
  const navigate = useNavigate();
  const { isUnlocked, isInitialized } = useVaultStore();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]!;
  });
  const [selectedMemory, setSelectedMemory] = useState<DecryptedMemory | null>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const { data: memories = [], isLoading: _isLoading } = useMemoriesList({
    includeArchived: false,
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now.toISOString().split('T')[0]!);
  };

  // Map memories by date string (YYYY-MM-DD)
  const memoriesByDate = useMemo(() => {
    const map = new Map<string, DecryptedMemory[]>();
    for (const mem of memories) {
      const dateKey = new Date(mem.entryDate).toISOString().split('T')[0]!;
      const list = map.get(dateKey) ?? [];
      list.push(mem);
      map.set(dateKey, list);
    }
    return map;
  }, [memories]);

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: {
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    // Leading days from previous month
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      const dateString = prevDate.toISOString().split('T')[0]!;
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(year, month, d);
      const dateString = thisDate.toISOString().split('T')[0]!;
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
      });
    }

    // Trailing days from next month to fill 42 cells (6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateString = nextDate.toISOString().split('T')[0]!;
      days.push({
        dateString,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
      });
    }

    return days;
  }, [year, month]);

  const selectedDateMemories = useMemo(() => {
    return memoriesByDate.get(selectedDate) ?? [];
  }, [memoriesByDate, selectedDate]);

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Calendar View</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            A reflective overview of your memories mapped to days.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleToday} className="text-xs">
            Today
          </Button>

          <div className="flex items-center gap-1 border border-border rounded-md bg-surface p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevMonth}
              className="p-1 h-auto text-ink-muted hover:text-ink"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-mono text-xs px-2 text-ink font-medium min-w-[120px] text-center">
              {monthName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextMonth}
              className="p-1 h-auto text-ink-muted hover:text-ink"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Vault Locked Banner if locked */}
      {!isUnlocked && isInitialized && (
        <div className="p-4 rounded-lg bg-surface border border-accent/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-ink">Vault is locked</h4>
              <p className="text-[11px] text-ink-muted">
                Dates and counts are visible, but titles and entries require your passphrase.
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

      {/* Calendar Grid */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-xs space-y-2">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-ink-subtle pb-2 border-b border-border/50">
          {weekDays.map((wd) => (
            <div key={wd} className="py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* 6x7 Days Matrix */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarDays.map((cell) => {
            const dayMems = memoriesByDate.get(cell.dateString) ?? [];
            const hasMemories = dayMems.length > 0;
            const isSelected = selectedDate === cell.dateString;

            return (
              <button
                key={cell.dateString}
                type="button"
                onClick={() => setSelectedDate(cell.dateString)}
                className={`relative min-h-[56px] sm:min-h-[72px] p-1.5 sm:p-2 rounded-lg text-left transition-all duration-150 flex flex-col justify-between cursor-pointer border ${
                  isSelected
                    ? 'border-accent bg-accent/10 ring-1 ring-accent'
                    : cell.isCurrentMonth
                      ? 'border-border/60 bg-canvas hover:border-border hover:bg-surface-hover'
                      : 'border-transparent bg-transparent opacity-40 hover:opacity-75'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`font-mono text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                      cell.isToday
                        ? 'bg-accent text-accent-ink font-bold'
                        : cell.isCurrentMonth
                          ? 'text-ink'
                          : 'text-ink-subtle'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {hasMemories && (
                    <span className="text-[10px] font-mono px-1 rounded bg-accent/20 text-accent font-medium">
                      {dayMems.length}
                    </span>
                  )}
                </div>

                {hasMemories && (
                  <div className="w-full flex items-center gap-1 overflow-hidden mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span className="text-[10px] text-ink-muted truncate font-serif hidden sm:inline">
                      {dayMems[0]?.title || 'Memory'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Memories Section */}
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/70">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-accent stroke-[1.5]" />
            <h2 className="font-serif text-lg font-semibold text-ink">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </h2>
          </div>

          <Link to={`/journal`}>
            <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs">
              <PenLine className="w-3.5 h-3.5" />
              <span>Write Entry</span>
            </Button>
          </Link>
        </div>

        {selectedDateMemories.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted space-y-1">
            <p>No memories recorded for this date.</p>
            <p className="text-ink-subtle">
              Click &ldquo;Write Entry&rdquo; above to record thoughts for today.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {selectedDateMemories.map((mem) => (
              <div
                key={mem.id}
                onClick={() => setSelectedMemory(mem)}
                className="p-3.5 rounded-lg border border-border bg-canvas hover:border-accent/50 hover:bg-surface transition-all duration-150 cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {mem.isPinned && (
                      <span className="text-[10px] font-mono text-accent flex items-center gap-0.5">
                        <Pin className="w-2.5 h-2.5 fill-current" />
                        Pinned
                      </span>
                    )}
                    {mem.mood && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-serif bg-surface border border-border text-ink-muted capitalize">
                        {mem.mood}
                      </span>
                    )}
                    <h3 className="font-serif text-sm font-semibold text-ink truncate">
                      {mem.title || <span className="italic text-ink-muted">Untitled</span>}
                    </h3>
                  </div>

                  {mem.isTimeCapsule && (
                    <span className="text-[10px] font-mono text-amber-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      Capsule
                    </span>
                  )}
                </div>

                <p className="text-xs text-ink-muted line-clamp-1">
                  {mem.bodyMarkdown
                    ? mem.bodyMarkdown.replace(/[#*_`~>-]/g, '').slice(0, 120)
                    : 'No written text'}
                </p>

                {mem.tags && mem.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {mem.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono text-ink-subtle flex items-center gap-0.5"
                      >
                        <Tag className="w-2 h-2 text-accent" />#{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Architectural Disclosure Note */}
      <div className="p-3.5 rounded-lg bg-surface/40 border border-border/50 text-[11px] text-ink-muted flex items-start gap-2.5 font-mono">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <span>
          <strong>Zero-Knowledge Disclosure:</strong> Coarse calendar date (<code>entryDate</code>)
          is indexed by PostgreSQL to support chronological layout and synchronization. All memory
          titles, prose, tags, moods, and file attachments remain 100% client-side encrypted with
          AES-256-GCM.
        </span>
      </div>

      {/* Memory Detail Modal */}
      <MemoryDetailModal
        isOpen={!!selectedMemory}
        memory={selectedMemory}
        onClose={() => setSelectedMemory(null)}
        onEdit={(mem) => navigate(`/journal?id=${mem.id}`)}
      />

      {/* Vault Unlock Modal */}
      <VaultUnlockModal isOpen={unlockModalOpen} onClose={() => setUnlockModalOpen(false)} />
    </div>
  );
}
