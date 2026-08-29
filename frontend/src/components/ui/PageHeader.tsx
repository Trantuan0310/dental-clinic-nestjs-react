import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  backTo?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, backTo, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-3.5 w-3.5" /> Quay lại
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}