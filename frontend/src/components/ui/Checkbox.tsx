import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer select-none items-start gap-2 rounded-md p-1 text-sm hover:bg-gray-50',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-transparent',
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}
