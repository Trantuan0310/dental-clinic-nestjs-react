import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      <Link
        to="/"
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200"
        aria-label="Trang chủ"
      >
        <Home className="h-4 w-4" />
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-gray-400 dark:text-surface-600" />
            {isLast || !item.href ? (
              <span
                className={cn(
                  'font-medium',
                  isLast
                    ? 'text-gray-900 dark:text-surface-100'
                    : 'text-gray-500 dark:text-surface-400'
                )}
              >
                {item.label}
              </span>
            ) : (
              <Link
                to={item.href}
                className="text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200"
              >
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
