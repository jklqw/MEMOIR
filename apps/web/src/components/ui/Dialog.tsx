import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './Button.js';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ isOpen, onClose, title, description, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        ref={dialogRef}
        className={cn(
          'w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl overflow-hidden text-ink p-6 space-y-4 animate-in zoom-in-95 duration-150',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-serif font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="text-xs text-ink-muted mt-1">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 h-auto text-ink-muted hover:text-ink"
          >
            <X className="w-4 h-4 stroke-[1.5]" />
          </Button>
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
