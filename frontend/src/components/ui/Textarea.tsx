import { cn } from '@/lib/cn';
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id ?? props.name ?? autoId;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-700 dark:text-surface-200"
          >
            {label}
            {props.required && <span className="ml-1 text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors',
            'placeholder:text-gray-400 dark:placeholder:text-surface-500',
            'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            'resize-y min-h-[80px]',
            'dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100',
            error &&
              'border-red-500 focus:border-red-500 focus:ring-red-500',
            className,
          )}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p id={hintId} className="text-xs text-gray-500 dark:text-surface-400">{hint}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
