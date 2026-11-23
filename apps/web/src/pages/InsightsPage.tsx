import { BarChart3, Info } from 'lucide-react';

export function InsightsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Personal Insights</h1>
          <p className="text-xs text-ink-muted mt-1">
            Writing streaks and reflective patterns computed 100% locally in browser memory.
          </p>
        </div>
      </div>

      <div className="p-4 bg-surface border border-border rounded-lg flex items-start gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5 stroke-[1.5]" />
        <p className="text-xs text-ink-muted leading-relaxed">
          <strong>Reflective Notice:</strong> All mood summaries and frequency metrics are personal
          diary reflections computed exclusively inside your browser. They are not medical,
          psychological, or diagnostic evaluations.
        </p>
      </div>

      <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-2">
        <BarChart3 className="w-8 h-8 text-ink-subtle mx-auto stroke-[1.5]" />
        <p className="text-sm font-medium text-ink">No Insight Data Yet</p>
        <p className="text-xs text-ink-muted">
          As you write memories with calm mood tags, personal trends will form here without
          disclosing anything to the server.
        </p>
      </div>
    </div>
  );
}
