import React from 'react';
import { cn } from '../../lib/utils.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || React.useId();
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium tracking-wide text-ink-muted uppercase"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'w-full px-3 py-2 text-sm bg-surface border rounded-md transition-all duration-150 ease-out',
            'border-border text-ink placeholder:text-ink-subtle',
            'focus:border-accent focus:bg-canvas focus:outline-hidden',
            error && 'border-destructive focus:border-destructive text-destructive',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive mt-1" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-ink-subtle mt-1">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
