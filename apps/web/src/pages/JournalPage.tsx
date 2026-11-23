import { useState } from 'react';
import { Calendar as CalendarIcon, Check, Pin } from 'lucide-react';
import { Button } from '../components/ui/Button.js';

export function JournalPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  const moods = [
    {
      label: 'Peaceful',
      value: 'peaceful',
      color: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    },
    {
      label: 'Reflective',
      value: 'reflective',
      color: 'bg-sky-500/20 text-sky-800 dark:text-sky-300',
    },
    {
      label: 'Grateful',
      value: 'grateful',
      color: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
    },
    {
      label: 'Melancholy',
      value: 'melancholy',
      color: 'bg-indigo-500/20 text-indigo-800 dark:text-indigo-300',
    },
    {
      label: 'Turbulent',
      value: 'turbulent',
      color: 'bg-rose-500/20 text-rose-800 dark:text-rose-300',
    },
    {
      label: 'Focused',
      value: 'focused',
      color: 'bg-teal-500/20 text-teal-800 dark:text-teal-300',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Editor Controls Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-border text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 stroke-[1.5]" />
          <span className="font-mono">
            {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPinned((prev) => !prev)}
            className={`p-1.5 h-auto ${isPinned ? 'text-accent' : 'text-ink-muted'}`}
            title={isPinned ? 'Unpin memory' : 'Pin memory'}
          >
            <Pin className="w-4 h-4 stroke-[1.5]" />
          </Button>

          <span className="flex items-center gap-1.5 text-xs font-mono text-ink-subtle">
            <Check className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
            <span>Encrypted locally</span>
          </span>
        </div>
      </div>

      {/* Mood Selector (Calm subtle chips) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-subtle mr-1">Mood:</span>
        {moods.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMood(mood === m.value ? null : m.value)}
            className={`px-2.5 py-1 rounded-full text-xs transition-all duration-150 cursor-pointer ${
              mood === m.value
                ? `${m.color} font-medium border border-current`
                : 'bg-surface hover:bg-surface-hover text-ink-muted border border-border'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Title Input */}
      <input
        type="text"
        placeholder="Untitled Memory"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full font-serif text-2xl sm:text-3xl text-ink font-semibold bg-transparent border-none outline-hidden placeholder:text-ink-subtle"
      />

      {/* Body Area */}
      <textarea
        placeholder="Write what comes to heart. Everything is padded and encrypted client-side..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={16}
        className="w-full font-sans text-sm sm:text-base text-ink bg-transparent border-none outline-hidden resize-none placeholder:text-ink-subtle leading-relaxed"
      />
    </div>
  );
}
