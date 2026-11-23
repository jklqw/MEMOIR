import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './Button.js';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('memoir-theme') === 'dark' ||
      (!localStorage.getItem('memoir-theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('memoir-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('memoir-theme', 'light');
    }
  }, [isDark]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label={isDark ? 'Switch to Archival Paper (light)' : 'Switch to Obsidian Ink (dark)'}
      className="p-1.5 h-auto text-ink-muted hover:text-ink"
      title={isDark ? 'Archival Paper theme' : 'Obsidian Ink theme'}
    >
      {isDark ? (
        <Sun className="w-4 h-4 stroke-[1.5]" />
      ) : (
        <Moon className="w-4 h-4 stroke-[1.5]" />
      )}
    </Button>
  );
}
