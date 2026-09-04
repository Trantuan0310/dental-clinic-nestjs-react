import { type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Sparkline } from './Sparkline';
import { Tooltip } from './Tooltip';
import type { SparklinePoint } from '@/types/dashboard';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  /** % change vs previous period. Positive = up (green), negative = down (red). */
  delta?: number;
  /** Tooltip / label explaining the comparison period (e.g. "So với 7 ngày qua cùng kỳ trước"). */
  deltaLabel?: string;
  /** Secondary line under value, e.g. "Khách mới: 5 / Khách quay lại: 12". */
  sublabel?: ReactNode;
  /** Mini line chart series. Omit to hide sparkline area. */
  sparkline?: SparklinePoint[];
  /** Optional icon in a colored circle. */
  icon?: ReactNode;
  iconBgClass?: string;
  iconFgClass?: string;
  className?: string;
}

const toneClass = {
  default: 'text-gray-900 dark:text-surface-100',
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-red-700 dark:text-red-400',
};

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  return `${rounded}%`;
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  delta,
  deltaLabel,
  sublabel,
  sparkline,
  icon,
  iconBgClass = 'bg-teal-100',
  iconFgClass = 'text-teal-600',
  className,
}: KpiCardProps) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const isUp = showDelta && (delta as number) >= 0;
  const deltaElement = showDelta ? (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        isUp
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      )}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {formatDelta(delta as number)}
    </span>
  ) : null;

  return (
    <div
      data-testid="kpi-card"
      className={cn('rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                iconBgClass,
                iconFgClass,
              )}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-surface-400">{label}</p>
            <p className={cn('mt-0.5 text-2xl font-semibold leading-tight', toneClass[tone])}>
              {value}
            </p>
            {sublabel && <div className="mt-1 text-xs text-gray-500 dark:text-surface-400">{sublabel}</div>}
            {!sublabel && hint && <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{hint}</p>}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {deltaElement &&
            (deltaLabel ? (
              <Tooltip label={deltaLabel}>{deltaElement}</Tooltip>
            ) : (
              deltaElement
            ))}
          {sparkline && sparkline.length > 0 && <Sparkline points={sparkline} />}
        </div>
      </div>
    </div>
  );
}