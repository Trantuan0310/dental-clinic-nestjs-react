// =============================================================================
// Dashboard Card components — split from DashboardPage for code-splitting
// Each card is a self-contained, lazy-loadable module.
// =============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Calendar,
  CreditCard,
  DollarSign,
  Eye,
  Megaphone,
  PlusCircle,
  RefreshCw,
  Stethoscope,
  Users,
  Wallet,
  BarChart3,
} from 'lucide-react';
import { Card, CardSkeleton, EmptyState, KpiCard, Tooltip, Alert } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { formatCurrency, formatNumber, vndCompact } from '@/lib/format';
import { useChartTheme } from '@/lib/chartTheme';
import {
  ACCENT_AMBER,
  SOURCE_COLORS,
  TEAL,
  TEAL_LIGHT,
  formatDayLabel,
  formatMonthLabel,
  type AppointmentPoint,
  type AppointmentStats,
  type CustomerType,
  type DailyRevenuePoint,
  type DashboardKpis,
  type FinanceSummary,
  type MonthlyRevenuePoint,
  type OutstandingSummary,
  type RevenueByCustomerType,
  type RevenueByDentistRow,
  type RevenueByProcedure,
  type RevenueBySource,
  type TimeRange,
} from './types';

// -----------------------------------------------------------------------------
// Shared card error state — a genuine API failure, distinct from "still
// loading" or "genuinely no data yet" so the admin gets a signal and a retry.
// -----------------------------------------------------------------------------

interface CardErrorStateProps {
  onRetry?: () => void;
}

function CardErrorState({onRetry}: CardErrorStateProps) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<AlertTriangle className="h-10 w-10 text-red-500" />}
      title={t('uiEntry.dashboard.errorTitle')}
      description={t('uiEntry.dashboard.errorDescription')}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('uiEntry.dashboard.retry')}
          </button>
        ) : undefined
      }
    />
  );
}

// -----------------------------------------------------------------------------
// KPI Row
// -----------------------------------------------------------------------------

interface KpiRowProps {
  kpis: DashboardKpis | undefined;
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function KpiRow({kpis, range, isLoading, isError, onRetry}: KpiRowProps) {
  const { t } = useTranslation();
  const comparisonLabel = t('uiEntry.dashboard.comparison', { range: t(`uiEntry.dashboard.range.${range}`) });

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError || !kpis) {
    return (
      <Alert type="danger" title={t('uiEntry.dashboard.kpiErrorTitle')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{t('uiEntry.dashboard.errorDescription')}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-white dark:bg-surface-800 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-surface-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('uiEntry.dashboard.retry')}
            </button>
          )}
        </div>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t('uiEntry.dashboard.patients')}
        value={formatNumber(kpis.patients.total)}
        delta={kpis.patients.pctChange}
        icon={<Users className="h-5 w-5" />}
        iconBgClass="bg-sky-100 dark:bg-sky-400/15"
        iconFgClass="text-sky-600 dark:text-sky-300"
        sublabel={
          kpis.patients.newCount !== undefined ? (
            <span className="flex items-center gap-2 text-[11px]">
              <Tooltip
                label={
                  <span>
                    {t('uiEntry.dashboard.firstVisit')}
                  </span>
                }
              >
                <span className="cursor-help whitespace-nowrap rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {t('uiEntry.dashboard.new')}: {kpis.patients.newCount}
                </span>
              </Tooltip>
              <Tooltip
                label={
                  <span>
                    {t('uiEntry.dashboard.returningDescription')}
                  </span>
                }
              >
                <span className="cursor-help whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {t('uiEntry.dashboard.returning')}: {kpis.patients.returningCount}
                </span>
              </Tooltip>
            </span>
          ) : undefined
        }
        sparkline={kpis.patients.sparkline}
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label={t('uiEntry.dashboard.appointmentsExcludingCancelled')}
        value={formatNumber(kpis.appointments.total)}
        delta={kpis.appointments.pctChange}
        icon={<Calendar className="h-5 w-5" />}
        iconBgClass="bg-indigo-100 dark:bg-indigo-400/15"
        iconFgClass="text-indigo-600 dark:text-indigo-300"
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label={t('uiEntry.dashboard.treatmentRevenue')}
        value={formatCurrency(kpis.treatmentRevenue.total)}
        delta={kpis.treatmentRevenue.pctChange}
        icon={<DollarSign className="h-5 w-5" />}
        iconBgClass="bg-emerald-100 dark:bg-emerald-400/15"
        iconFgClass="text-emerald-600 dark:text-emerald-300"
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label={t('uiEntry.dashboard.collected')}
        value={formatCurrency(kpis.collected.total)}
        delta={kpis.collected.pctChange}
        icon={<Wallet className="h-5 w-5" />}
        iconBgClass="bg-teal-100 dark:bg-teal-400/15"
        iconFgClass="text-teal-600 dark:text-teal-300"
        deltaLabel={comparisonLabel}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Customer type donut
// -----------------------------------------------------------------------------

interface CustomerTypeCardProps {
  /** Real split from the backend (A6-13), no longer pro-rated by head count. */
  rows: RevenueByCustomerType[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function CustomerTypeCard({rows: data, isLoading, isError, onRetry}: CustomerTypeCardProps) {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const totalRevenue = data.reduce((acc, d) => acc + d.revenue, 0);
  const labels: Record<CustomerType, string> = { NEW: t('uiEntry.dashboard.new'), RETURNING: t('uiEntry.dashboard.returning') };
  const colors: Record<CustomerType, string> = { NEW: TEAL, RETURNING: TEAL_LIGHT };

  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.customerRevenue')} description={t('uiEntry.dashboard.customerRevenueDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={t('uiEntry.dashboard.customerRevenue')} description={t('uiEntry.dashboard.customerRevenueDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  // Net of refunds the total can be 0 (or below) with invoices issued.
  const invoiceCount = data.reduce((acc, d) => acc + (d.count ?? 0), 0);
  const showChart = totalRevenue > 0 && data.every((d) => d.revenue >= 0);
  if (invoiceCount === 0 && totalRevenue === 0) {
    return (
      <Card title={t('uiEntry.dashboard.customerRevenue')} description={t('uiEntry.dashboard.customerRevenueDescription')}>
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noRevenue')}
          description={t('uiEntry.dashboard.noInvoices')}
          action={
            <Link
              to="/billing/list"
              className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              <PlusCircle className="h-4 w-4" /> {t('uiEntry.dashboard.createInvoice')}
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title={t('uiEntry.dashboard.customerRevenue')}
      description={t('uiEntry.dashboard.newCustomerDefinition')}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {showChart ? (
        <div className="mx-auto w-full md:mx-0 md:w-5/12">
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 5, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="type"
                  tickFormatter={(type: CustomerType) => labels[type] ?? type}
                  stroke={chart.axis}
                  fontSize={11}
                />
                <YAxis tickFormatter={(v: number) => vndCompact(v)} stroke={chart.axis} fontSize={11} />
                <ReTooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), t('uiOperations.revenue')]}
                  labelFormatter={(type: any) => labels[type as CustomerType] ?? ''}
                  {...chart.tooltip}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.type} fill={colors[entry.type]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-gray-500 dark:text-surface-400">
            {t('uiEntry.dashboard.total')}:{' '}
            <span className="font-semibold text-gray-900 dark:text-surface-100">{formatCurrency(totalRevenue)}</span>
          </p>
        </div>
        ) : (
          <div className="text-center md:w-5/12">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-surface-500">{t('uiEntry.dashboard.totalAfterRefunds')}</p>
            <p className="text-base font-bold text-gray-900 dark:text-surface-100">{formatCurrency(totalRevenue)}</p>
          </div>
        )}
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.type} className="flex items-center justify-between rounded-md border border-gray-100 dark:border-surface-700 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: colors[d.type] }} />
                <span className="text-sm font-medium text-gray-700 dark:text-surface-200">{labels[d.type]}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 dark:text-surface-100">{formatCurrency(d.revenue)}</p>
                <p className="text-xs text-gray-500 dark:text-surface-400">
                  {d.percentage}% · {t('uiEntry.dashboard.invoiceCount', { count: d.count })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Source breakdown
// -----------------------------------------------------------------------------

interface SourceCardProps {
  rows: RevenueBySource[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function SourceCard({rows, isLoading, isError, onRetry}: SourceCardProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.sourceRevenue')} description={t('uiEntry.dashboard.sourceDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={t('uiEntry.dashboard.sourceRevenue')} description={t('uiEntry.dashboard.sourceDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  const FALLBACK_SOURCES: RevenueBySource[] = [
    { source: 'WALK_IN', sourceLabel: t('uiEntry.dashboard.sourceWalkIn'), revenue: 0, percentage: 0, count: 0 },
    { source: 'PHONE', sourceLabel: t('uiEntry.dashboard.sourcePhone'), revenue: 0, percentage: 0, count: 0 },
    { source: 'ONLINE', sourceLabel: t('uiEntry.dashboard.sourceOnline'), revenue: 0, percentage: 0, count: 0 },
    { source: 'RETURNING', sourceLabel: t('uiEntry.dashboard.sourceReturning'), revenue: 0, percentage: 0, count: 0 },
  ];
  const byKey = new Map(rows.map((r) => [r.source, r]));
  const merged = FALLBACK_SOURCES.map((f) => byKey.get(f.source) ?? f);
  const hasAny = rows.some((r) => r.revenue > 0);

  return (
    <Card title={t('uiEntry.dashboard.sourceRevenue')} description={t('uiEntry.dashboard.sourceDescription')}>
      {!hasAny ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noSources')}
          description={t('uiEntry.dashboard.sourceEmpty')}
          action={
            <Link
              to="/appointments/list"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white dark:bg-surface-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-surface-200 hover:bg-gray-50 dark:bg-surface-900"
            >
              <Calendar className="h-4 w-4" /> {t('uiEntry.dashboard.openAppointments')}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {merged.map((row) => (
            <li key={row.source}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 dark:text-surface-200">{row.sourceLabel}</span>
                <span className="font-semibold text-gray-900 dark:text-surface-100">
                  {formatCurrency(row.revenue)}{' '}
                  <span className="text-xs font-normal text-gray-500 dark:text-surface-400">
                    ({row.percentage.toFixed(1)}% · {t('uiEntry.revenueSourceCases', { count: row.count })})
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(Math.max(row.percentage, 2), 100)}%`,
                    background: SOURCE_COLORS[row.source] ?? TEAL,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Procedure revenue
// -----------------------------------------------------------------------------

interface ProcedureCardProps {
  rows: RevenueByProcedure[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ProcedureCard({rows, isLoading, isError, onRetry}: ProcedureCardProps) {
  const { t } = useTranslation();
  const chart = useChartTheme();
  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.procedureRevenue')} description={t('uiEntry.dashboard.top10Procedures')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={t('uiEntry.dashboard.procedureRevenue')} description={t('uiEntry.dashboard.top10Procedures')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={t('uiEntry.dashboard.procedureRevenue')} description={t('uiEntry.dashboard.top10Procedures')}>
        <EmptyState
          icon={<Stethoscope className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noProcedures')}
          description={t('uiEntry.dashboard.procedureEmpty')}
          action={
            <Link
              to="/today"
              className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              <Calendar className="h-4 w-4" /> {t('uiEntry.dashboard.openTodayQueue')}
            </Link>
          }
        />
      </Card>
    );
  }

  if (rows.length <= 2) {
    const isSingle = rows.length === 1;
    return (
      <Card title={t('uiEntry.dashboard.procedureRevenue')} description={t('uiEntry.dashboard.topProcedures')}>
        <ul className="space-y-2">
          {rows.map((r, idx) => (
            <li
              key={r.procedure}
              className="flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <span className="truncate text-sm font-medium text-gray-800 dark:text-surface-200">{r.procedure}</span>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-gray-900 dark:text-surface-100 ${isSingle ? 'text-lg' : 'text-sm'}`}>
                  {formatCurrency(r.revenue)}
                </p>
                <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.dashboard.countVisits', { count: r.count })}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs italic text-gray-500 dark:text-surface-400">
          {t('uiEntry.dashboard.procedureChartHint')}
        </p>
      </Card>
    );
  }

  return (
    <Card title={t('uiEntry.dashboard.procedureRevenue')} description={t('uiEntry.dashboard.top10Procedures')}>
      <div className="h-52">
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
            <XAxis type="number" tickFormatter={(value: number) => vndCompact(value)} stroke={chart.axis} fontSize={11} />
            <YAxis type="category" dataKey="procedure" width={130} stroke={chart.axis} fontSize={11} />
            <ReTooltip
              formatter={(value: any) => [formatCurrency(Number(value)), t('uiOperations.revenue')]}
              {...chart.tooltip}
            />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]} fill={chart.series[0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Dentist ranking
// -----------------------------------------------------------------------------

interface DentistRankingCardProps {
  rows: RevenueByDentistRow[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function DentistRankingCard({rows, isLoading, isError, onRetry}: DentistRankingCardProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.dentistRevenue')} description={t('uiEntry.dashboard.dentistDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={t('uiEntry.dashboard.dentistRevenue')} description={t('uiEntry.dashboard.dentistDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={t('uiEntry.dashboard.dentistRevenue')} description={t('uiEntry.dashboard.dentistDescription')}>
        <EmptyState
          icon={<Stethoscope className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noDentistData')}
          description={t('uiEntry.dashboard.dentistEmpty')}
        />
      </Card>
    );
  }

  const compact = rows.length <= 3;

  if (compact) {
    return (
      <Card title={t('uiEntry.dashboard.dentistRevenue')} description={t('uiEntry.dashboard.dentistDescription')}>
        <ol className="space-y-3">
          {rows.map((row, idx) => {
            const initials = row.dentistName
              .split(' ')
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const medal = ['🥇', '🥈', '🥉'][idx] ?? '·';
            return (
              <li
                key={row.dentistId}
                className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-800 p-3 hover:bg-gray-50 dark:bg-surface-900"
              >
                <span className="text-lg" aria-hidden>
                  {medal}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900 dark:text-surface-100">{row.dentistName}</p>
                  <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.dashboard.casesExamined', { count: row.count })}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-surface-100">{formatCurrency(row.revenue)}</p>
                  <p className="text-xs text-gray-500 dark:text-surface-400">{row.percentage.toFixed(1)}%</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs italic text-gray-500 dark:text-surface-400">
          {t('uiEntry.dashboard.assistantNote')}
        </p>
      </Card>
    );
  }

  return (
    <Card title={t('uiEntry.dashboard.dentistRevenue')} description={t('uiEntry.dashboard.dentistDescription')}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-surface-700 text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-surface-400">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-4">{t('uiEntry.dashboard.dentist')}</th>
              <th className="py-2 pr-4 text-right">{t('uiEntry.dashboard.caseCount')}</th>
              <th className="py-2 pr-4 text-right">{t('uiEntry.dashboard.revenue')}</th>
              <th className="py-2 text-right">{t('uiEntry.dashboard.rate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const initials = row.dentistName
                .split(' ')
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase();
              return (
                <tr key={row.dentistId} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-3 text-gray-500 dark:text-surface-400">{idx + 1}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                        {initials}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-surface-100">{row.dentistName}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-700 dark:text-surface-200">{row.count}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900 dark:text-surface-100">{formatCurrency(row.revenue)}</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      {row.percentage.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs italic text-gray-500 dark:text-surface-400">
          {t('uiEntry.dashboard.assistantNote')}
        </p>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Daily 15-day chart
// -----------------------------------------------------------------------------

interface DailyChartCardProps {
  rows: DailyRevenuePoint[];
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function DailyChartCard({rows, range, isLoading, isError, onRetry}: DailyChartCardProps) {
  const { t } = useTranslation();
  // Title follows the selected range (A6-18), it used to always say 15 days.
  const title = t('uiEntry.dashboard.dailyRevenue', { range: t(`uiEntry.dashboard.range.${range}`) });
  const description = t('uiEntry.dashboard.dailyDescription');
  const chart = useChartTheme();
  const data = useMemo(() => rows.map((r) => ({ ...r, label: formatDayLabel(r.date) })), [rows]);

  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title} description={description}>
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noInvoicesInRange')}
          description={t('uiEntry.dashboard.expandRange')}
        />
      </Card>
    );
  }

  return (
    <Card
      title={title}
      description={description}
      actions={
        <span className="inline-flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TEAL }} />
            Doanh thu
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: ACCENT_AMBER }} />
            {t('uiEntry.dashboard.invoiceCountShort')}
          </span>
        </span>
      }
    >
      <div className="h-56 md:h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.axis} fontSize={11} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => vndCompact(v)} stroke={chart.axis} fontSize={11} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} stroke={chart.axis} fontSize={11} />
            <ReTooltip
              formatter={(value: any, name: any) => {
                if (name === t('uiOperations.revenue')) return [formatCurrency(Number(value)), name];
                return [value, t('uiEntry.dashboard.invoiceCountShort')];
              }}
              {...chart.tooltip}
            />
            <Bar yAxisId="left" dataKey="revenue" name={t('uiOperations.revenue')} fill={chart.series[0]} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="invoiceCount" name={t('uiEntry.dashboard.invoiceCountShort')} fill={ACCENT_AMBER} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Monthly 6-month area
// -----------------------------------------------------------------------------

interface MonthlyChartCardProps {
  rows: MonthlyRevenuePoint[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function MonthlyChartCard({rows, isLoading, isError, onRetry}: MonthlyChartCardProps) {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const data = useMemo(() => rows.map((r) => ({ ...r, label: formatMonthLabel(r.month) })), [rows]);

  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.monthlyRevenue')} description={t('uiEntry.dashboard.monthlyDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={t('uiEntry.dashboard.monthlyRevenue')} description={t('uiEntry.dashboard.monthlyDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={t('uiEntry.dashboard.monthlyRevenue')} description={t('uiEntry.dashboard.monthlyDescription')}>
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noSixMonthData')}
          description={t('uiEntry.dashboard.noSixMonthInvoices')}
        />
      </Card>
    );
  }

  return (
    <Card title={t('uiEntry.dashboard.monthlyRevenue')} description={t('uiEntry.dashboard.monthlyDescription')}>
      <div className="h-52 md:h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.axis} fontSize={11} />
            <YAxis tickFormatter={(v: number) => vndCompact(v)} stroke={chart.axis} fontSize={11} />
            <ReTooltip
              formatter={(value: any) => [formatCurrency(Number(value)), t('uiOperations.revenue')]}
              {...chart.tooltip}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke={chart.series[0]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: chart.series[0] }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// 7-day appointments line
// -----------------------------------------------------------------------------

interface AppointmentsCardProps {
  rows: AppointmentPoint[];
  range: TimeRange;
  /** Own calendar only (a dentist), so the title does not read as clinic-wide. */
  ownOnly?: boolean;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function AppointmentsCard({rows, range, ownOnly, isLoading, isError, onRetry}: AppointmentsCardProps) {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const data = useMemo(() => rows.map((r) => ({ ...r, label: formatDayLabel(r.date) })), [rows]);
  const title = `${t(ownOnly ? 'uiEntry.dashboard.myAppointments' : 'uiEntry.dashboard.appointmentsTitle')} — ${t(`uiEntry.dashboard.range.${range}`)}`;
  const description = t('uiEntry.dashboard.appointmentsDescription');

  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title} description={description}>
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noAppointments')}
          description={t('uiEntry.dashboard.createAppointment')}
          action={
            // 'hide' mode, not the default 'disable': PermissionGuard's
            // disable mode sets a `disabled` prop, which a router <Link>
            // (a plain anchor under the hood) doesn't honor — it would
            // still navigate. A dentist has no appointment.create, so this
            // used to be a working-looking CTA that landed on a form that
            // 403s on submit.
            <PermissionGuard permission="appointment.create" mode="hide">
              <Link
                to="/appointments?action=create"
                className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                <Calendar className="h-4 w-4" /> {t('uiEntry.dashboard.createAppointmentAction')}
              </Link>
            </PermissionGuard>
          }
        />
      </Card>
    );
  }

  return (
    <Card title={title} description={description}>
      <div className="h-48 md:h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.axis} fontSize={11} />
            <YAxis allowDecimals={false} stroke={chart.axis} fontSize={11} />
            <ReTooltip
              formatter={(value: any) => [value, t('uiEntry.dashboard.appointmentsCount')]}
              {...chart.tooltip}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={chart.series[0]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: chart.series[0] }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Finance + Outstanding
// -----------------------------------------------------------------------------

interface FinanceCardProps {
  finance: FinanceSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function FinanceCard({finance, isLoading, isError, onRetry}: FinanceCardProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.finance')} description={t('uiEntry.dashboard.financeDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError || !finance) {
    return (
      <Card title={t('uiEntry.dashboard.finance')} description={t('uiEntry.dashboard.financeDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <Card title={t('uiEntry.dashboard.finance')} description={t('uiEntry.dashboard.financeDescription')}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Wallet className="h-4 w-4" /> {t('uiEntry.dashboard.totalIncome')}
          </div>
          <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">
            {formatCurrency(finance.totalIncome)}
          </p>
        </div>
        <div className="rounded-md border border-rose-100 bg-rose-50/60 p-4 dark:border-rose-900/30 dark:bg-rose-900/20 dark:p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
            <CreditCard className="h-4 w-4" /> {t('uiEntry.dashboard.totalExpenses')}
          </div>
          <p className="mt-1 text-xl font-semibold text-rose-700 dark:text-rose-300">
            {formatCurrency(finance.totalExpense)}
          </p>
          {/* Its own line: dentist pay is not an expense category. */}
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
            {t('uiEntry.dashboard.payrollPaid')}: {formatCurrency(finance.payrollPaid ?? 0)}
          </p>
        </div>
      </div>
      {finance.totalExpense === 0 && (
        <p className="mt-3 text-xs text-gray-500 dark:text-surface-400">
          {t('uiEntry.dashboard.noApprovedExpenses')}
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.dashboard.incomeNote')}</p>
    </Card>
  );
}

interface OutstandingCardProps {
  outstanding: OutstandingSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function OutstandingCard({outstanding, isLoading, isError, onRetry}: OutstandingCardProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card title={t('uiEntry.dashboard.outstanding')} description={t('uiEntry.dashboard.outstandingDescription')}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError || !outstanding) {
    return (
      <Card title={t('uiEntry.dashboard.outstanding')} description={t('uiEntry.dashboard.outstandingDescription')}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (outstanding.invoiceCount === 0) {
    return (
      <Card title={t('uiEntry.dashboard.outstanding')} description={t('uiEntry.dashboard.outstandingDescription')}>
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noDebt')}
          description={t('uiEntry.dashboard.fullyPaid')}
        />
      </Card>
    );
  }

  return (
    <Card title={t('uiEntry.dashboard.outstanding')} description={t('uiEntry.dashboard.outstandingDescription')}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-amber-700">{formatCurrency(outstanding.totalDebt)}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.dashboard.unpaidInvoices', { count: outstanding.invoiceCount })}</p>
        </div>
        <Link
          to="/billing/list?status=ISSUED,PARTIAL"
          className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Eye className="h-4 w-4" /> {t('uiEntry.dashboard.viewDetails')}
        </Link>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Appointment outcomes (A6-12) — the front desk's "today" KPIs
// -----------------------------------------------------------------------------

interface AppointmentStatsCardProps {
  stats: AppointmentStats | undefined;
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function AppointmentStatsCard({stats, range, isLoading, isError, onRetry}: AppointmentStatsCardProps) {
  const { t } = useTranslation();
  const own = stats?.scope === 'own';
  const title = `${t(own ? 'uiEntry.dashboard.appointmentOutcomesMine' : 'uiEntry.dashboard.appointmentOutcomes')} — ${t(`uiEntry.dashboard.range.${range}`)}`;
  const description = t('uiEntry.dashboard.outcomesDescription');
  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }
  if (isError || !stats) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }
  const s = stats.summary;
  const tiles: Array<{ label: string; value: number; hint: string; cls: string }> = [
    { label: t('uiEntry.dashboard.totalAppointments'), value: s.total, hint: t('uiEntry.dashboard.totalAppointmentsHint'), cls: 'text-gray-900 dark:text-surface-100' },
    { label: t('uiEntry.dashboard.notArrived'), value: s.pending, hint: t('uiEntry.dashboard.notArrivedHint'), cls: 'text-sky-700' },
    { label: t('uiEntry.dashboard.arrived'), value: s.arrived, hint: t('uiEntry.dashboard.arrivedHint'), cls: 'text-emerald-700' },
    { label: t('uiEntry.dashboard.atClinic'), value: s.inClinic, hint: t('uiEntry.dashboard.atClinicHint'), cls: 'text-teal-700' },
    { label: t('uiEntry.dashboard.noShow'), value: s.noShow, hint: t('uiEntry.dashboard.noShowHint', { rate: stats.rates.noShowPct }), cls: 'text-amber-700' },
    {
      label: t('uiEntry.dashboard.cancelled'),
      value: s.cancelled,
      hint: s.cancelledAfterCheckIn
        ? t('uiEntry.dashboard.cancelledAfterCheckIn', { count: s.cancelledAfterCheckIn })
        : t('uiEntry.dashboard.cancelledHint'),
      cls: 'text-rose-700',
    },
    { label: t('uiEntry.dashboard.left'), value: s.left, hint: t('uiEntry.dashboard.leftHint'), cls: 'text-orange-700' },
    { label: t('uiEntry.dashboard.walkIn'), value: s.walkIn, hint: t('uiEntry.dashboard.walkInHint'), cls: 'text-indigo-700' },
    { label: t('uiEntry.dashboard.online'), value: s.online, hint: t('uiEntry.dashboard.onlineHint'), cls: 'text-violet-700' },
  ];
  return (
    <Card title={title} description={description}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {tiles.map((t) => (
          // The tooltip wrapper is inline by default; stretched here so every
          // tile fills its grid cell (the tiles were uneven widths).
          <Tooltip key={t.label} label={<span>{t.hint}</span>} className="flex w-full">
            <div className="flex w-full cursor-help flex-col justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800/40">
              <p className="text-xs font-medium leading-snug text-gray-500 dark:text-surface-400">{t.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${t.cls} dark:text-surface-100`}>{formatNumber(t.value)}</p>
            </div>
          </Tooltip>
        ))}
      </div>
      {stats.onlineFunnel && stats.onlineFunnel.requests > 0 && (
        <p className="mt-3 text-xs text-gray-500 dark:text-surface-400">
          {t('uiEntry.dashboard.onlineRequests', stats.onlineFunnel)}{' '}
          {stats.onlineFunnel.spam > 0 && t('uiEntry.dashboard.spamRequests', { count: stats.onlineFunnel.spam })}
        </p>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Empty placeholder (re-export to keep all card components in one barrel)
// -----------------------------------------------------------------------------
export type { ReactNode };
