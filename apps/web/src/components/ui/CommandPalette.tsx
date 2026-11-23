import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  FolderLock,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from './Dialog.js';

interface NavigationItem {
  name: string;
  href: string;
  icon: typeof BookOpen;
  shortcut?: string;
}

const NAV_ITEMS: NavigationItem[] = [
  { name: 'Journal', href: '/journal', icon: BookOpen, shortcut: 'J' },
  { name: 'Timeline', href: '/timeline', icon: Archive, shortcut: 'T' },
  { name: 'Calendar', href: '/calendar', icon: Calendar, shortcut: 'C' },
  { name: 'Time Capsules', href: '/capsules', icon: Clock, shortcut: 'K' },
  { name: 'Private Vault', href: '/vault', icon: FolderLock, shortcut: 'V' },
  { name: 'Personal Insights', href: '/insights', icon: BarChart3, shortcut: 'I' },
  { name: 'Security Dashboard', href: '/security', icon: Shield, shortcut: 'S' },
  { name: 'Settings & Portability', href: '/settings', icon: Settings, shortcut: 'P' },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter items
  const filteredItems = NAV_ITEMS.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = (href: string) => {
    setIsOpen(false);
    navigate(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + (filteredItems.length || 1)) % (filteredItems.length || 1),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        handleSelect(target.href);
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Quick Navigation"
      className="max-w-md p-4"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-ink-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages or press Esc to close..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-hidden"
            aria-label="Search navigation commands"
          />
        </div>

        <div
          role="listbox"
          aria-label="Navigation suggestions"
          className="space-y-1 max-h-60 overflow-y-auto"
        >
          {filteredItems.length === 0 ? (
            <p className="text-xs text-ink-subtle p-3 text-center">
              No destination matches "{query}"
            </p>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.href}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item.href)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 stroke-[1.5]" />
                    <span>{item.name}</span>
                  </div>
                  {item.shortcut && (
                    <kbd className="font-mono text-[10px] bg-canvas px-1.5 py-0.5 rounded border border-border text-ink-subtle">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-ink-subtle">
          <span>Navigate with ↑↓ · Select with Enter</span>
          <span>Open anytime with ⌘K / Ctrl+K</span>
        </div>
      </div>
    </Dialog>
  );
}
