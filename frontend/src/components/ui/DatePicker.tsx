import { useId, forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className, label, error, hint, id, value, onChange, 'aria-describedby': ariaDescribedBy, ...rest }, ref) => {
    // Without an id/name the <label> used to point at nothing, so the field
    // had no accessible name; fall back to a generated id like Input does.
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const messageId = error || hint ? `${inputId}-message` : undefined;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label} {rest.required && <span className="text-red-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined}
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn('input-base dark:text-surface-100', error && 'dark:border-red-500 border-red-400 focus:border-red-500 focus:ring-red-500', className)}
          {...rest}
        />
        {error ? <p id={messageId} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p id={messageId} className="mt-1 text-xs text-gray-500 dark:text-surface-400">{hint}</p> : null}
      </div>
    );
  },
);
DatePicker.displayName = 'DatePicker';