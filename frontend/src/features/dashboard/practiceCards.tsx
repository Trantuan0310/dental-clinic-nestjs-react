// =============================================================================
// Practice measures on the Dashboard (docs/11_Improvement B1, B2):
//   - ScorecardCard: six rates as bullet graphs against a target
//   - CapacityHeatmapCard: how full the dentists' open hours are, weekday × hour
// Both are drawn with plain markup (no chart library), so they cost no bundle.
// =============================================================================
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Card, CardSkeleton, EmptyState, Select, Tooltip } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { dashboardApi } from './dashboardApi';
import type { TFunction } from 'i18next';
import type { CapacityCell, CapacityHeatmap, Scorecard, ScorecardMetric, TimeRange } from './types';
import { cellStyle, scaleMax, verdictOf, type Verdict } from './practiceMath';

// -----------------------------------------------------------------------------
// Bullet graph (Stephen Few): the value as a bar, the target as a tick, and
// two or three shades behind them for poor / acceptable / good.
// -----------------------------------------------------------------------------

const clampPct = (value: number, max: number) => Math.max(0, Math.min(100, (value / max) * 100));

const VERDICT_TEXT: Record<Verdict, string> = {
  good: 'text-emerald-700 dark:text-emerald-400',
  ok: 'text-amber-700 dark:text-amber-400',
  poor: 'text-rose-700 dark:text-rose-400',
};

function BulletGraph({ metric }: { metric: ScorecardMetric }) {
  const max = scaleMax(metric);
  const { target, okAt, direction, value } = metric;
  // Three bands from the left: [0, a) [a, b) [b, max]; the darkest is the poor one.
  const [a, b] = direction === 'lower' ? [target, okAt] : [okAt, target];
  const shades =
    direction === 'lower'
      ? ['bg-gray-200 dark:bg-surface-700', 'bg-gray-300 dark:bg-surface-600', 'bg-gray-400 dark:bg-surface-500']
      : ['bg-gray-400 dark:bg-surface-500', 'bg-gray-300 dark:bg-surface-600', 'bg-gray-200 dark:bg-surface-700'];
  const aPct = clampPct(a, max);
  const bPct = clampPct(b, max);
  return (
    <div className="relative h-5 w-full overflow-hidden rounded-sm" aria-hidden>
      <div className="absolute inset-y-0 left-0 flex w-full">
        <div className={shades[0]} style={{ width: `${aPct}%` }} />
        <div className={shades[1]} style={{ width: `${bPct - aPct}%` }} />
        <div className={shades[2]} style={{ width: `${100 - bPct}%` }} />
      </div>
      {value != null && (
        <div
          className="absolute inset-y-[6px] left-0 rounded-r-sm bg-brand-700 dark:bg-brand-400"
          style={{ width: `${clampPct(value, max)}%` }}
        />
      )}
      <div
        className="absolute inset-y-[2px] w-[3px] -translate-x-1/2 bg-gray-900 dark:bg-white"
        style={{ left: `${clampPct(target, max)}%` }}
      />
    </div>
  );
}

function formatValue(m: Pick<ScorecardMetric, 'value' | 'unit'>, t: TFunction): string {
  if (m.value == null) return '—';
  const n = formatNumber(m.value);
  return m.unit === 'percent' ? `${n}%` : t('uiEntry.dashboard.practice.minutes', { value: n });
}

function MetricRow({ metric }: { metric: ScorecardMetric }) {
  const { t } = useTranslation();
  const verdict = verdictOf(metric);
  const sign = metric.direction === 'lower' ? '≤' : '≥';
  const targetText = `${sign} ${formatValue({ value: metric.target, unit: metric.unit }, t)}`;
  const counts =
    metric.denominator != null && metric.numerator != null
      ? t('uiEntry.dashboard.practice.countsOf', { num: metric.numerator, den: metric.denominator })
      : metric.denominator != null
        ? t('uiEntry.dashboard.practice.countsVisits', { n: metric.denominator })
        : null;
  return (
    <li data-testid={`scorecard-${metric.key}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-medium text-gray-800 dark:text-surface-100">
            {t(`uiEntry.dashboard.practice.metric.${metric.key}`)}
            <Tooltip label={<span className="block max-w-xs">{t(`uiEntry.dashboard.practice.formula.${metric.key}`)}</span>}>
              <button
                type="button"
                aria-label={t('uiEntry.dashboard.practice.formulaLabel', {
                  metric: t(`uiEntry.dashboard.practice.metric.${metric.key}`),
                })}
                className="rounded text-gray-400 hover:text-gray-600 dark:hover:text-surface-200"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Tooltip>
          </p>
          <p className="text-xs text-gray-500 dark:text-surface-400">
            {t('uiEntry.dashboard.practice.target', { target: targetText })}
            {counts ? ` · ${counts}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-semibold tabular-nums text-gray-900 dark:text-surface-100">
            {formatValue(metric, t)}
          </p>
          <p className={`text-xs font-medium ${verdict ? VERDICT_TEXT[verdict] : 'text-gray-400'}`}>
            {verdict ? t(`uiEntry.dashboard.practice.verdict.${verdict}`) : t('uiEntry.dashboard.practice.noData')}
          </p>
        </div>
      </div>
      <div className="mt-1.5">
        <BulletGraph metric={metric} />
      </div>
    </li>
  );
}

interface ScorecardCardProps {
  scorecard?: Scorecard;
  range: TimeRange;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}

export function ScorecardCard({ scorecard, range, isLoading, isError, onRetry }: ScorecardCardProps) {
  const { t } = useTranslation();
  const title = `${t('uiEntry.dashboard.practice.scorecardTitle')} — ${t(`uiEntry.dashboard.range.${range}`)}`;
  const description = t('uiEntry.dashboard.practice.scorecardDescription');
  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }
  if (isError || !scorecard) {
    return (
      <Card title={title} description={description}>
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {t('uiEntry.dashboard.practice.loadError')}{' '}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium underline">
              {t('uiClinical.retry')}
            </button>
          )}
        </p>
      </Card>
    );
  }
  return (
    <Card title={title} description={description}>
      <ul className="space-y-4">
        {scorecard.metrics.map((m) => (
          <MetricRow key={m.key} metric={m} />
        ))}
      </ul>
      <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-surface-700 dark:text-surface-400">
        {t('uiEntry.dashboard.practice.scorecardSources')}
      </p>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Capacity heatmap: weekday × hour, colour = booked share of the open hours.
// -----------------------------------------------------------------------------

/** Monday first; Sunday last, and only when the clinic opens on it. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function percentOf(u: number): string {
  return `${Math.round(u * 100)}%`;
}

function Heatmap({ data }: { data: CapacityHeatmap }) {
  const { t } = useTranslation();
  const weekdays = WEEKDAY_ORDER.filter((d) => d !== 0 || data.cells.some((c) => c.weekday === 0));
  const hours = [...new Set(data.cells.map((c) => c.hour))].sort((a, b) => a - b);
  const first = hours[0];
  const last = hours[hours.length - 1];
  const rows = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const byKey = new Map<string, CapacityCell>(data.cells.map((c) => [`${c.weekday}|${c.hour}`, c]));
  const names = t('uiEntry.dashboard.practice.weekdays', { returnObjects: true }) as string[];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-xs" data-testid="capacity-heatmap">
        <caption className="sr-only">{t('uiEntry.dashboard.practice.heatmapTitle')}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-12" />
            {weekdays.map((d) => (
              <th key={d} scope="col" className="pb-1 text-center font-medium text-gray-600 dark:text-surface-300">
                {names[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((hour) => (
            <tr key={hour}>
              <th scope="row" className="pr-2 text-right font-mono font-normal text-gray-500 dark:text-surface-400">
                {String(hour).padStart(2, '0')}:00
              </th>
              {weekdays.map((d) => {
                const cell = byKey.get(`${d}|${hour}`);
                if (!cell) {
                  return (
                    <td
                      key={d}
                      className="h-8 rounded-sm border border-dashed border-gray-200 dark:border-surface-700"
                      aria-label={t('uiEntry.dashboard.practice.closedCell', { day: names[d], hour })}
                    />
                  );
                }
                const { backgroundColor, dark } = cellStyle(cell.utilization);
                const label = t('uiEntry.dashboard.practice.cellLabel', {
                  day: names[d],
                  hour,
                  percent: percentOf(cell.utilization),
                  booked: Math.round(cell.bookedMin),
                  open: Math.round(cell.availableMin),
                });
                return (
                  <td key={d} className="p-0">
                    <Tooltip label={<span>{label}</span>} className="flex w-full">
                      <div
                        className={`flex h-8 w-full items-center justify-center rounded-sm font-mono tabular-nums ${
                          dark ? 'text-white' : 'text-gray-700 dark:text-surface-100'
                        }`}
                        style={{ backgroundColor }}
                        aria-label={label}
                        data-testid="capacity-cell"
                      >
                        {percentOf(cell.utilization)}
                      </div>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-surface-400" aria-hidden>
        <span>0%</span>
        <span
          className="h-2 w-32 rounded-sm"
          style={{ background: 'linear-gradient(to right, rgba(27,122,120,0.07), rgba(27,122,120,0.95))' }}
        />
        <span>100%</span>
      </div>
    </div>
  );
}

interface CapacityHeatmapCardProps {
  range: { from: string; to: string };
  rangeKey: TimeRange;
}

export function CapacityHeatmapCard({ range, rangeKey }: CapacityHeatmapCardProps) {
  const { t } = useTranslation();
  const [dentistId, setDentistId] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointments', 'capacity-heatmap', range, dentistId],
    queryFn: () => dashboardApi.capacityHeatmap({ ...range, dentistId: dentistId || undefined }),
  });
  const title = `${t('uiEntry.dashboard.practice.heatmapTitle')} — ${t(`uiEntry.dashboard.range.${rangeKey}`)}`;
  const description = t('uiEntry.dashboard.practice.heatmapDescription');
  const actions = (
    <div className="w-48">
      <Select
        aria-label={t('uiEntry.dashboard.practice.dentistFilter')}
        value={dentistId}
        onChange={(e) => setDentistId(e.target.value)}
        options={[
          { value: '', label: t('uiEntry.dashboard.practice.allDentists') },
          ...(data?.dentists ?? []).map((d) => ({ value: d.id, label: d.fullName })),
        ]}
      />
    </div>
  );
  return (
    <Card title={title} description={description} actions={actions}>
      {isLoading ? (
        <CardSkeleton />
      ) : isError || !data ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {t('uiEntry.dashboard.practice.loadError')}{' '}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            {t('uiClinical.retry')}
          </button>
        </p>
      ) : data.cells.length === 0 ? (
        <EmptyState title={t('uiEntry.dashboard.practice.heatmapEmpty')} />
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-700 dark:text-surface-200">
            {t('uiEntry.dashboard.practice.heatmapSummary', {
              percent: data.totals.utilization == null ? '—' : percentOf(data.totals.utilization),
              hours: formatNumber(Math.round(data.totals.bookedMin / 60)),
              open: formatNumber(Math.round(data.totals.availableMin / 60)),
            })}
          </p>
          <Heatmap data={data} />
          <p className="mt-3 text-xs text-gray-500 dark:text-surface-400">
            {t('uiEntry.dashboard.practice.heatmapNote')}
          </p>
        </>
      )}
    </Card>
  );
}
