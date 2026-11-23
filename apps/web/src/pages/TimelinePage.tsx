import { Archive, Search } from 'lucide-react';
import { Input } from '../components/ui/Input.js';

export function TimelinePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Timeline & Archive</h1>
      </div>

      <div className="relative">
        <Input
          placeholder="Search decrypted entries locally..."
          className="pl-9"
          hint="Full-text search executes strictly in browser RAM. No terms are ever sent to the server."
        />
        <Search className="w-4 h-4 text-ink-subtle absolute left-3 top-2.5 stroke-[1.5]" />
      </div>

      <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-2">
        <Archive className="w-8 h-8 text-ink-subtle mx-auto stroke-[1.5]" />
        <p className="text-sm font-medium text-ink">Your timeline is empty</p>
        <p className="text-xs text-ink-muted">
          Memories you compose in your journal will appear here chronologically once encrypted.
        </p>
      </div>
    </div>
  );
}
