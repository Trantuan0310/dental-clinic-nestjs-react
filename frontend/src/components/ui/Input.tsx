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
  ({ className, label, error, hint, leftAddon, rightAddon, id, required, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    // Always generate a stable id so we can wire aria-describedby for hint/error
    // even when the caller doesn't pass an explicit id.
    const autoId = useId();
    const inputId = id ?? autoId;
    const hintId = hint && !error ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-surface-200">
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
              className="flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
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
              'min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors',
              'placeholder:text-gray-400 dark:placeholder:text-surface-500',
              'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
              'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
              'dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 dark:[color-scheme:dark]',
              error && 'dark:border-red-500 border-red-500 focus:border-red-500 focus:ring-red-500',
              leftAddon && 'rounded-l-none',
              rightAddon && 'rounded-r-none',
              className,
            )}
            {...props}
          />
          {rightAddon && (
            <span
              className="flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
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
          <p id={hintId} className="text-xs text-gray-500 dark:text-surface-400">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';