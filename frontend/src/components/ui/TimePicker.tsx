import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TimePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(
  ({ className, label, error, hint, id, value, onChange, ...rest }, ref) => {
    const inputId = id ?? rest.name;
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
          type="time"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn('input-base', error && 'border-red-400 focus:border-red-500 focus:ring-red-500', className)}
          {...rest}
        />
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      </div>
    );
  },
);
TimePicker.displayName = 'TimePicker';