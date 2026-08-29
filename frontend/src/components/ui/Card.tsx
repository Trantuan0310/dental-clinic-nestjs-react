import { cn } from '@/lib/cn';
import { type ReactNode } from 'react';

export interface CardProps {
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  noPadding?: boolean;
}

export function Card({
  className,
  bodyClassName,
  children,
  title,
  description,
  actions,
  noPadding = false,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900',
        className,
      )}
    >
      {(title || description || actions) && (
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-surface-100">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </div>
      )}
      <div
        className={cn(
          noPadding ? '' : 'p-6',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
