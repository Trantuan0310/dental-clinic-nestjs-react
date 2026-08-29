import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Accessible label. Defaults to "Loading". */
  label?: string;
}

const SIZE_PX: Record<NonNullable<SpinnerProps['size']>, number> = {
  sm: 16,
  md: 20,
  lg: 32,
};

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex', className)}>
      <Loader2
        className="animate-spin text-primary-600"
        style={{ width: SIZE_PX[size], height: SIZE_PX[size] }}
        aria-hidden="true"
      />
      <span className="sr-only">{label ?? 'Loading'}</span>
    </span>
  );
}

export function PageLoader({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500"
    >
      <Spinner size="lg" />
      <p className="text-sm">{label ?? t('common.loading')}</p>
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
        </td>
      ))}
    </tr>
  );
}