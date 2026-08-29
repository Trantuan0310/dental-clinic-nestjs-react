import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  icon?: ReactNode;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, icon, ...props }, ref) => {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          {icon || <Search className="h-4 w-4 text-gray-400 dark:text-surface-500" />}
        </div>
        <input
          ref={ref}
          type="text"
          className={cn(
            'w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm shadow-sm transition-colors',
            'placeholder:text-gray-400 dark:placeholder:text-surface-500',
            'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            'dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100',
            'dark:disabled:bg-surface-900 dark:disabled:text-surface-500',
            className,
          )}
          value={value}
          {...props}
        />
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-surface-500 dark:hover:text-surface-200"
            aria-label="Xóa tìm kiếm"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';
