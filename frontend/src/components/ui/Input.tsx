import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftAddon, rightAddon, id, required, ...props }, ref) => {
    // Always generate a stable id so we can wire aria-describedby for hint/error
    // even when the caller doesn't pass an explicit id.
    const autoId = useId();
    const inputId = id ?? props.name ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
            {required && (
              <>
                <span className="ml-1 text-red-500" aria-hidden="true">
                  *
                </span>
                <span className="sr-only"> (bắt buộc)</span>
              </>
            )}
          </label>
        )}
        <div className="relative flex">
          {leftAddon && (
            <span
              aria-hidden="true"
              className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500"
            >
              {leftAddon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cn(
              'flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors',
              'placeholder:text-gray-400 dark:placeholder:text-surface-500',
              'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
              'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
              'dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
              leftAddon && 'rounded-l-none',
              rightAddon && 'rounded-r-none',
              className,
            )}
            {...props}
          />
          {rightAddon && (
            <span
              aria-hidden="true"
              className="flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500"
            >
              {rightAddon}
            </span>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-gray-500">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';