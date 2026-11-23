import { cn } from '../../lib/utils.js';

export interface LoadingSkeletonProps {
  className?: string;
  count?: number;
  variant?: 'card' | 'line' | 'text' | 'circle';
}

export function LoadingSkeleton({ className, count = 1, variant = 'line' }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  const getVariantStyles = () => {
    switch (variant) {
      case 'card':
        return 'h-28 w-full rounded-lg bg-surface border border-border/60 p-4 space-y-3';
      case 'text':
        return 'h-4 w-3/4 rounded bg-surface-hover';
      case 'circle':
        return 'h-10 w-10 rounded-full bg-surface-hover';
      case 'line':
      default:
        return 'h-3.5 w-full rounded bg-surface-hover';
    }
  };

  return (
    <div role="status" aria-label="Loading archival content..." className="space-y-3 w-full">
      {items.map((key) => (
        <div
          key={key}
          className={cn(
            'animate-pulse transition-opacity motion-reduce:animate-none',
            getVariantStyles(),
            className,
          )}
        >
          {variant === 'card' && (
            <>
              <div className="h-3.5 w-1/3 bg-surface-hover rounded" />
              <div className="h-3 w-5/6 bg-surface-hover/80 rounded" />
              <div className="h-3 w-2/3 bg-surface-hover/60 rounded" />
            </>
          )}
          <span className="sr-only">Loading content...</span>
        </div>
      ))}
    </div>
  );
}
