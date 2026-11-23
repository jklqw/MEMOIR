import { useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  PenLine,
  Pin,
  Search,
  Tag,
  Unlock,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { DecryptedMemory } from '@memoir/shared';
import { MemoryDetailModal } from '../components/memory/MemoryDetailModal.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { VaultUnlockModal } from '../components/vault/VaultUnlockModal.js';
import { useMemoriesList } from '../hooks/useMemories.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function TimelinePage() {
  const navigate = useNavigate();
  const { isUnlocked, isInitialized } = useVaultStore();

  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<DecryptedMemory | null>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const { data: memories = [], isLoading } = useMemoriesList({
    includeArchived,
  });

  // Extract all unique tags and moods across all decrypted memories for filtering
  const { allTags, allMoods } = useMemo(() => {
    const tagSet = new Set<string>();
    const moodSet = new Set<string>();

    for (const mem of memories) {
      if (mem.mood) moodSet.add(mem.mood);
      if (mem.tags) {
        for (const t of mem.tags) tagSet.add(t);
      }
    }

    return {
      allTags: Array.from(tagSet).sort(),
      allMoods: Array.from(moodSet).sort(),
    };
  }, [memories]);

  // 100% Client-Side Local Search & In-Memory Filtering
  const filteredMemories = useMemo(() => {
    let result = memories;

    // Filter by mood
    if (selectedMood) {
      result = result.filter((m) => m.mood?.toLowerCase() === selectedMood.toLowerCase());
    }

    // Filter by tag
    if (selectedTag) {
      result = result.filter((m) => m.tags?.includes(selectedTag));
    }

    // Filter by local search query across title, body, and tags
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((m) => {
        const titleMatch = m.title?.toLowerCase().includes(q);
        const bodyMatch = m.bodyMarkdown?.toLowerCase().includes(q);
        const tagMatch = m.tags?.some((t) => t.toLowerCase().includes(q));
        return titleMatch || bodyMatch || tagMatch;
      });
    }

    // Sort: Pinned first, then by entryDate descending
    return [...result].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime();
    });
  }, [memories, selectedMood, selectedTag, searchQuery]);

  // Paginated slice
  const totalPages = Math.ceil(filteredMemories.length / PAGE_SIZE) || 1;
  const paginatedMemories = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMemories.slice(start, start + PAGE_SIZE);
  }, [filteredMemories, currentPage]);

  // Group paginated items by Month & Year
  const groupedMemories = useMemo(() => {
    const groups: { [key: string]: DecryptedMemory[] } = {};

    for (const mem of paginatedMemories) {
      const date = new Date(mem.entryDate);
      const groupKey = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey]!.push(mem);
    }

    return Object.entries(groups);
  }, [paginatedMemories]);

  const handleEdit = (mem: DecryptedMemory) => {
    navigate(`/journal?id=${mem.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Timeline & Archive</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Your encrypted chronological journey, decrypted strictly on this device.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/journal">
            <Button variant="primary" size="sm" className="flex items-center gap-1.5 text-xs">
              <PenLine className="w-3.5 h-3.5" />
              <span>New Entry</span>
            </Button>
          </Link>
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
                Unlock your local vault to decrypt titles, bodies, and tags in RAM.
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

      {/* Local Search & Filter Controls */}
      <div className="space-y-3">
        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search decrypted entries locally..."
            className="pl-9 pr-9 text-xs sm:text-sm"
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Tag dropdown/chips */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-ink-subtle">Tag:</span>
                <select
                  value={selectedTag ?? ''}
                  onChange={(e) => {
                    setSelectedTag(e.target.value || null);
                    setCurrentPage(1);
                  }}
                  className="bg-surface border border-border rounded px-2 py-1 text-xs text-ink outline-hidden"
                >
                  <option value="">All tags</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter by Mood */}
            {allMoods.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-ink-subtle">Mood:</span>
                <select
                  value={selectedMood ?? ''}
                  onChange={(e) => {
                    setSelectedMood(e.target.value || null);
                    setCurrentPage(1);
                  }}
                  className="bg-surface border border-border rounded px-2 py-1 text-xs text-ink capitalize outline-hidden"
                >
                  <option value="">All moods</option>
                  {allMoods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear filters button */}
            {(selectedTag || selectedMood || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(null);
                  setSelectedMood(null);
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-xs text-accent hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Archive Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-ink-muted hover:text-ink text-xs select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                setIncludeArchived(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>Include Archived</span>
          </label>
        </div>

        {/* Security badge: Client-side local search assertion */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-ink-subtle bg-surface/40 px-3 py-1 rounded border border-border/50">
          <Check className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
          <span>Full-text search executes strictly in RAM. Zero search terms sent to server.</span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="py-16 text-center space-y-2">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-ink-muted">Decrypting memory index in memory...</p>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-border rounded-lg space-y-3">
          <Archive className="w-8 h-8 text-ink-subtle mx-auto stroke-[1.5]" />
          <h3 className="text-sm font-medium text-ink">
            {searchQuery || selectedMood || selectedTag
              ? 'No matching memories found'
              : 'Your timeline is empty'}
          </h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {searchQuery || selectedMood || selectedTag
              ? 'Try adjusting your client-side search terms or clearing active filters.'
              : 'Memories you compose in your journal will appear here chronologically once encrypted.'}
          </p>
          {!searchQuery && !selectedMood && !selectedTag && (
            <Link to="/journal">
              <Button variant="secondary" size="sm" className="mt-2 text-xs">
                Write First Memory
              </Button>
            </Link>
          )}
        </div>
      ) : (
        /* Chronological Timeline List grouped by Month & Year */
        <div className="space-y-8">
          {groupedMemories.map(([monthYear, items]) => (
            <div key={monthYear} className="space-y-3">
              {/* Month & Year Section Heading */}
              <div className="sticky top-0 z-10 py-1.5 bg-canvas/95 backdrop-blur-xs border-b border-border/60">
                <h2 className="font-serif text-sm font-semibold tracking-wide text-ink-muted uppercase">
                  {monthYear}
                </h2>
              </div>

              {/* Cards Grid / List */}
              <div className="space-y-2.5">
                {items.map((memory) => {
                  const dateObj = new Date(memory.entryDate);
                  const dayNum = dateObj.getDate();
                  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                  const isPendingCapsule =
                    memory.isTimeCapsule &&
                    memory.unlockAt &&
                    new Date(memory.unlockAt) > new Date();

                  return (
                    <div
                      key={memory.id}
                      onClick={() => setSelectedMemory(memory)}
                      className={`group p-4 rounded-lg border bg-surface hover:bg-surface-hover transition-all duration-150 cursor-pointer flex items-start gap-4 ${
                        memory.isPinned ? 'border-accent/40 bg-accent/5' : 'border-border'
                      }`}
                    >
                      {/* Date Badge */}
                      <div className="shrink-0 text-center w-10 py-1 px-1 rounded bg-canvas border border-border">
                        <span className="block text-xs uppercase font-mono text-ink-subtle leading-none">
                          {weekday}
                        </span>
                        <span className="block text-base font-serif font-bold text-ink leading-tight mt-0.5">
                          {dayNum}
                        </span>
                      </div>

                      {/* Content Preview */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {memory.isPinned && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent">
                              <Pin className="w-2.5 h-2.5 fill-current" />
                              Pinned
                            </span>
                          )}
                          {Boolean(memory.archivedAt) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-muted">
                              <Archive className="w-2.5 h-2.5" />
                              Archived
                            </span>
                          )}
                          {memory.isTimeCapsule && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono ${
                                isPendingCapsule ? 'text-amber-500' : 'text-emerald-500'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              {isPendingCapsule ? 'Time Capsule (Sealed)' : 'Time Capsule'}
                            </span>
                          )}
                          {memory.mood && (
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-serif bg-canvas border border-border text-ink-muted capitalize">
                              {memory.mood}
                            </span>
                          )}
                        </div>

                        <h3 className="font-serif text-base font-semibold text-ink truncate group-hover:text-accent transition-colors">
                          {memory.title || <span className="italic text-ink-muted">Untitled</span>}
                        </h3>

                        {isPendingCapsule ? (
                          <p className="text-xs text-ink-muted italic">
                            Ciphertext withheld by server until unlock date.
                          </p>
                        ) : (
                          <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">
                            {memory.bodyMarkdown
                              ? memory.bodyMarkdown.replace(/[#*_`~>-]/g, '').slice(0, 160)
                              : 'No written text in this entry.'}
                          </p>
                        )}

                        {memory.tags && memory.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {memory.tags.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center gap-0.5 text-[10px] font-mono text-ink-subtle"
                              >
                                <Tag className="w-2 h-2 text-accent" />#{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border text-xs text-ink-muted">
              <span>
                Page {currentPage} of {totalPages} ({filteredMemories.length} entries)
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 h-auto"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 h-auto"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Memory Detail Modal */}
      <MemoryDetailModal
        isOpen={!!selectedMemory}
        memory={selectedMemory}
        onClose={() => setSelectedMemory(null)}
        onEdit={handleEdit}
      />

      {/* Vault Unlock Modal */}
      <VaultUnlockModal isOpen={unlockModalOpen} onClose={() => setUnlockModalOpen(false)} />
    </div>
  );
}
