import React from 'react';
import { cn } from '../../lib/utils.js';
import { Button } from './Button.js';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-lg border border-dashed border-border bg-surface/40 space-y-4 my-4',
        className,
      )}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <Icon className="w-5 h-5 stroke-[1.5]" />
        </div>
      )}

      <div className="space-y-1.5 max-w-sm">
        <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted leading-relaxed">{description}</p>
      </div>

      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
