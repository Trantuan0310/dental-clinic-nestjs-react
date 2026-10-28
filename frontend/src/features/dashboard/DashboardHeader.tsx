// =============================================================================
// Dashboard header — range selector, quick actions
// =============================================================================
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import { Tooltip, QuickActions } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { RANGE_OPTIONS, type TimeRange } from './types';

interface DashboardHeaderProps {
  range: TimeRange;
  setRange: (r: TimeRange) => void;
}

export function DashboardHeader({ range, setRange }: DashboardHeaderProps) {
  const { t, i18n } = useTranslation();
  const rangeDescription = t(`uiEntry.dashboard.range.${range}`);
  const rangeLabels: Record<TimeRange, string> = {
    today: t('uiEntry.dashboard.range.today'),
    '7d': t('uiEntry.dashboard.range.sevenDays'),
    '15d': t('uiEntry.dashboard.range.fifteenDays'),
    '30d': t('uiEntry.dashboard.range.thirtyDays'),
    '6m': t('uiEntry.dashboard.range.sixMonths'),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {/* Same title style as every other page (PageHeader). */}
          <h1 className="text-2xl font-semibold leading-tight text-gray-900 dark:text-surface-100">
            {t('uiEntry.dashboard.overview')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
            <span className="font-medium text-gray-700 dark:text-surface-200">{rangeDescription}</span>
            {' · '}
            {format(new Date(), t('uiEntry.dashboard.dateFormat'), { locale: i18n.language === 'en' ? enUS : vi })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip label={t('uiEntry.dashboard.rangeTooltip')}>
            <div className="inline-flex cursor-help items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-surface-700 dark:bg-surface-800">
              <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as TimeRange)}
                className="bg-transparent text-sm font-medium text-gray-800 focus:outline-none dark:text-surface-100"
                aria-label={t('uiEntry.dashboard.rangeLabel')}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {rangeLabels[o.value]}
                  </option>
                ))}
              </select>
            </div>
          </Tooltip>
        </div>
      </div>

      <QuickActions />
    </div>
  );
}
