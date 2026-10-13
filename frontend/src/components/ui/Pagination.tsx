import { cn } from '@/lib/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  const { t } = useTranslation();
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    const showEllipsisThreshold = 7;

    if (totalPages <= showEllipsisThreshold) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <nav aria-label={t('uiCommon.pagination.label')} className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="text-sm text-gray-500 dark:text-surface-400">
        {totalItems !== undefined && pageSize !== undefined && (
          <span>
            {t('uiCommon.pagination.showing', { from: totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, totalItems), total: totalItems })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || totalPages === 0}
          aria-label={t('uiCommon.pagination.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          {getPageNumbers().map((page, index) =>
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => onPageChange(page)}
                aria-current={currentPage === page ? 'page' : undefined}
                aria-label={currentPage === page ? t('uiCommon.pagination.currentPage', { page }) : t('uiCommon.pagination.page', { page })}
                className="w-9"
              >
                {page}
              </Button>
            ),
          )}
        </div>

        <span className="px-2 text-sm sm:hidden">{t('uiCommon.pagination.compact', { page: totalPages === 0 ? 0 : currentPage, total: totalPages })}</span>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={t('uiCommon.pagination.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
