import { Calendar as CalendarIcon } from 'lucide-react';

export function CalendarPage() {
  const today = new Date();
  const currentMonth = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Calendar View</h1>
        <span className="font-mono text-xs text-ink-muted">{currentMonth}</span>
      </div>

      <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-2">
        <CalendarIcon className="w-8 h-8 text-ink-subtle mx-auto stroke-[1.5]" />
        <p className="text-sm font-medium text-ink">Monthly Overview</p>
        <p className="text-xs text-ink-muted">
          Your entries are grouped by entry date. Coarse calendar dates are visible for
          synchronization.
        </p>
      </div>
    </div>
  );
}
