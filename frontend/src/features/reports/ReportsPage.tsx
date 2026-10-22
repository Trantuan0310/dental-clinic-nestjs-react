/**
 * ReportsPage — revenue (issued invoices by issue date), collected (payments
 * by payment date, net of refunds) and every open balance by age.
 * Same definitions as the Dashboard (backend reports/revenue-basis.ts).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Receipt,
  TrendingUp,
  Download,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, Alert } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent, vndCompact } from '@/lib/format';
import { useChartTheme } from '@/lib/chartTheme';
import { exportCsv } from '@/lib/csv';
import { clinicParts, clinicToday } from '@/lib/clinicTime';
import type { OutstandingAgingEntry, OutstandingBucket } from '@/types/billing';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

type TooltipFormatter = (value: unknown, name: unknown) => [string, string];
/**
 * Charts plot đồng, so a money series shows its exact amount here while the
 * axis tick shortens it. The series used to be divided down to millions and
 * then formatted as đồng, which dropped six digits off every tooltip.
 */
const tooltipFormatter = ((value: unknown, name: unknown) => {
  if (typeof value === 'number') {
    return [`${formatCurrency(value)}`, String(name ?? '')];
  }
  return [String(value ?? ''), String(name ?? '')];
}) as TooltipFormatter;


/** "yyyy-MM-dd" → "dd/MM" without going through the browser's time zone. */
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Clinic calendar date of an instant, as dd/MM/yyyy. */
const clinicDateLabel = (value: string | null) => {
  if (!value) return '—';
  const d = clinicParts(value).date;
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};
const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const AGING_COLUMNS: Array<{ bucket: OutstandingBucket; key: string; color: string }> = [
  { bucket: 'D90_PLUS', key: 'over90Days', color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
  { bucket: 'D61_90', key: 'days61to90', color: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' },
  { bucket: 'D31_60', key: 'days31to60', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { bucket: 'D8_30', key: 'days8to30', color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
  { bucket: 'D0_7', key: 'under7Days', color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
];

function ChartErrorNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <span>{t('uiOperations.chartLoadFailed')}</span>
      <button
        onClick={onRetry}
        className="rounded-md border border-gray-300 px-3 py-1 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
      >
        {t('uiOperations.retry')}
      </button>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  // Clinic calendar, not the workstation's clock.
  const [fromDate, setFromDate] = useState(() => daysBefore(clinicToday(), 30));
  const [toDate, setToDate] = useState(() => clinicToday());
  const chart = useChartTheme();
  const colors = chart.series;
  // ISO 'yyyy-MM-dd' strings compare correctly lexicographically.
  const isOrderValid = fromDate <= toDate;
  // The API reads at most 366 days per report.
  const isSpanValid = Date.parse(toDate) - Date.parse(fromDate) <= 365 * 86_400_000;
  const isDateRangeValid = isOrderValid && isSpanValid;

  // report.read only opens the menu; the API checks the canonical codes
  // (A6-25), so each section is gated by the code its endpoint needs.
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canSeeRevenue = hasPermission('report.revenue.read');
  const canSeeOutstanding = hasPermission('report.outstanding.read');

  // Main revenue report
  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['revenue-report', fromDate, toDate],
    queryFn: () => billingApi.getRevenueReport({ from: fromDate, to: toDate }),
    enabled: isDateRangeValid && canSeeRevenue,
  });

  // Daily revenue for line chart
  const {
    data: dailyData,
    isError: dailyError,
    refetch: refetchDaily,
  } = useQuery({
    queryKey: ['revenue-by-day', fromDate, toDate],
    queryFn: () => billingApi.getRevenueByDay({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Revenue by procedure
  const {
    data: byProcedure,
    isError: byProcedureError,
    refetch: refetchByProcedure,
  } = useQuery({
    queryKey: ['revenue-by-procedure', fromDate, toDate],
    queryFn: () => billingApi.getRevenueByProcedure({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Revenue by source
  const {
    data: bySource,
    isError: bySourceError,
    refetch: refetchBySource,
  } = useQuery({
    queryKey: ['revenue-by-source', fromDate, toDate],
    queryFn: () => billingApi.getRevenueBySource({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Outstanding aging
  const {
    data: outstandingData,
    isError: outstandingError,
    refetch: refetchOutstanding,
  } = useQuery({
    // Every open balance (A6-09): the buckets below used to be empty except
    // ">90 days" because only 90-day-old debt was requested.
    queryKey: ['outstanding-report'],
    queryFn: () => billingApi.getOutstandingReport(),
    enabled: canSeeOutstanding,
  });

  // Chart data from daily revenue
  const dailyChartData = (dailyData ?? []).map(d => ({
    date: dayLabel(d.date),
    revenue: d.revenue,
    count: d.invoiceCount,
  }));

  // Chart data from monthly revenue in report
  const monthlyChartData = (report?.byMonth ?? []).map(m => ({
    month: m.month,
    revenue: m.total,
    collected: m.paid,
  }));

  // Revenue by dentist chart data
  const dentistChartData = (report?.byDentist ?? []).map(d => ({
    name: d.dentistName.replace(/^BS\.\s*/i, ''),
    revenue: d.revenue,
    paid: d.paid,
    count: d.count,
  }));

  // Collected by payment method (net of refunds; shares of what was collected)
  const paymentChartData = (report?.byPaymentMethod ?? []).map(m => ({
    method: m.method === 'CASH' ? t('uiOperations.cash') : m.method === 'BANK_TRANSFER' ? t('uiOperations.bankTransfer') : m.method,
    amount: m.amount,
    percent: m.sharePct,
    count: m.count,
  }));

  // Revenue by procedure chart data (top 10)
  const procedureChartData = (byProcedure ?? []).slice(0, 10).map(p => ({
    procedure: p.procedure,
    revenue: p.revenue,
    count: p.count,
  }));

  // Revenue by source chart data
  const sourceChartData = (bySource ?? []).map(s => ({
    source: s.sourceLabel,
    revenue: s.revenue,
    percent: s.percentage,
    count: s.count,
  }));

  const outstandingList = outstandingData?.data ?? [];
  // Oldest first: the bucket comes from the backend (clinic days).
  const sortedOutstanding = [...outstandingList].sort((a, b) => b.daysOld - a.daysOld);
  const byBucket = (bucket: OutstandingBucket) => outstandingList.filter(i => i.bucket === bucket);

  // Shared exporter: UTF-8 BOM + formula neutralizing (A6-15).
  const handleExportRevenue = () => {
    exportCsv(`doanh-thu_${fromDate}_${toDate}`, dailyData ?? [], [
      { header: t('uiOperations.issuedDate'), accessor: d => d.date },
      { header: t('uiOperations.revenue'), accessor: d => d.revenue },
      { header: t('uiOperations.invoiceCount'), accessor: d => d.invoiceCount },
    ]);
  };

  const handleExportOutstanding = () => {
    exportCsv<OutstandingAgingEntry>(`cong-no_${clinicToday()}`, sortedOutstanding, [
      { header: t('uiOperations.invoiceCode'), accessor: i => i.code },
      { header: t('uiOperations.patient'), accessor: i => i.patient.fullName },
      { header: t('uiOperations.patientCode'), accessor: i => i.patient.code },
      { header: t('uiOperations.phone'), accessor: i => i.patient.phone ?? '' },
      { header: t('uiOperations.visitDate'), accessor: i => clinicDateLabel(i.visitDate) },
      { header: t('uiOperations.dentist'), accessor: i => i.dentistName ?? '' },
      { header: t('uiOperations.invoiceTotal'), accessor: i => i.total },
      { header: t('uiOperations.outstanding'), accessor: i => i.outstanding },
      { header: t('uiOperations.issuedDate'), accessor: i => clinicDateLabel(i.issuedAt) },
      { header: t('uiOperations.daysPastDue'), accessor: i => i.daysOld },
      { header: t('uiOperations.agingBucket'), accessor: i => i.bucketLabel },
    ]);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('uiOperations.billingReport')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('uiOperations.billingReportDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {canSeeRevenue && (
            <Button variant="outline" onClick={handleExportRevenue} disabled={!dailyData?.length}>
              <Download className="h-4 w-4" />
              {t('uiOperations.exportRevenue')}
            </Button>
          )}
          {canSeeOutstanding && (
            <Button variant="outline" onClick={handleExportOutstanding} disabled={!outstandingList.length}>
              <Download className="h-4 w-4" />
              {t('uiOperations.exportOutstanding')}
            </Button>
          )}
        </div>
      </div>

      {/* Date Range Filter */}
      <Card noPadding className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="report-from-date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('uiOperations.dateFrom')}</label>
            <input
              id="report-from-date"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`rounded-md border bg-white px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-white ${
                isDateRangeValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-500'
              }`}
            />
          </div>
          <div>
            <label htmlFor="report-to-date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('uiOperations.dateTo')}</label>
            <input
              id="report-to-date"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className={`rounded-md border bg-white px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-white ${
                isDateRangeValid ? 'border-gray-300 dark:border-gray-600' : 'border-red-500'
              }`}
            />
          </div>
        </div>
        {!isDateRangeValid && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {isOrderValid
              ? t('uiOperations.max366Days')
              : t('uiOperations.dateFromMustBeBefore')}
          </p>
        )}
      </Card>

      {!canSeeRevenue && !canSeeOutstanding && (
        <Alert type="info" title={t('uiOperations.noReportPermission')}>{t('uiOperations.noReportPermissionDescription')}</Alert>
      )}

      {canSeeRevenue && (
      <>
      {/* Every other query on this page is enabled only once `report`
          succeeds, so a failure here previously rendered every KPI/chart
          as a silent zero — indistinguishable from a genuinely empty
          period — with no way to retry. */}
      {reportError && (
        <Alert type="danger" title={t('uiOperations.revenueReportLoadFailed')}>
          <div className="flex items-center justify-between gap-4">
            <span>{t('uiOperations.reportRetryMessage')}</span>
            <button
              onClick={() => refetchReport()}
              className="shrink-0 rounded-md border border-red-300 px-3 py-1 text-sm font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
            >
              {t('uiOperations.retry')}
            </button>
          </div>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-brand-100 dark:bg-brand-900 p-3">
              <Receipt className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.revenueByIssueDate')}</p>
              <p className="text-xl font-semibold tabular-nums sm:text-2xl text-gray-900 dark:text-white">
                {reportLoading ? '—' : formatCurrency(report?.totalInvoiced ?? 0)}
              </p>
              {!!report?.totalVoided && (
                <p className="text-xs text-gray-500">{t('uiOperations.voidsDeducted')} {formatCurrency(report.totalVoided)}</p>
              )}
              {!!report?.totalAdjusted && (
                <p className="text-xs text-gray-500">{t('uiOperations.adjustmentsDeducted')} {formatCurrency(report.totalAdjusted)}</p>
              )}
              {report && (
                <p className="text-xs text-gray-500" title={t('uiOperations.totalDiscountHint')}>
                  {t('uiOperations.totalDiscount')}: {formatCurrency(report.totalDiscount ?? 0)}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.collectedByPaymentDate')}</p>
              <p className="text-xl font-semibold tabular-nums sm:text-2xl text-green-600 dark:text-green-400">
                {reportLoading ? '—' : formatCurrency(report?.totalCollected ?? 0)}
              </p>
              {!!report?.totalRefunded && (
                <p className="text-xs text-gray-500">{t('uiOperations.refundsDeducted')} {formatCurrency(report.totalRefunded)}</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-3">
              <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.outstandingInPeriod')}</p>
              <p className="text-xl font-semibold tabular-nums sm:text-2xl text-amber-600 dark:text-amber-400">
                {reportLoading ? '—' : formatCurrency(report?.totalOutstanding ?? 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.issuedInvoiceCount')}</p>
              <p className="text-xl font-semibold tabular-nums sm:text-2xl text-gray-900 dark:text-white">
                {reportLoading ? '—' : formatNumber(report?.invoiceCount ?? 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Revenue by Status */}
      {report && (report.byStatus.length > 0 || report.excluded.draft.count + report.excluded.voided.count > 0) && (
        <Card title={t('uiOperations.reportByStatus')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {report.byStatus.map((s) => (
              <div key={s.status} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t(`uiOperations.${s.status.toLowerCase()}`, { defaultValue: s.status })}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(s.total)}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{s.count} {t('uiOperations.invoiceCountSuffix')}</p>
              </div>
            ))}
            {/* Shown apart, never added to the totals above. */}
            <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.excludedFromRevenue')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('uiOperations.draftPrefix')} {report.excluded.draft.count} ({formatCurrency(report.excluded.draft.total)})
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('uiOperations.voidedPrefix')} {report.excluded.voided.count} ({formatCurrency(report.excluded.voided.total)})
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Revenue Chart */}
        <Card title={t('uiOperations.revenueByIssueDay')}>
          <div className="h-64">
            {dailyError ? (
              <ChartErrorNotice onRetry={() => refetchDaily()} />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke={chart.axis} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke={chart.axis}
                  tickFormatter={(value) => vndCompact(Number(value))}
                />
                <Tooltip formatter={tooltipFormatter} {...chart.tooltip} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={t('uiOperations.revenue')}
                  stroke={colors[0]}
                  strokeWidth={2}
                  dot={{ fill: colors[0], strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: colors[0] }}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Monthly Revenue Chart */}
        <Card title={t('uiOperations.revenueByMonth')}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke={chart.axis} />
                <YAxis tick={{ fontSize: 12 }} stroke={chart.axis} tickFormatter={(v) => vndCompact(Number(v))} />
                <Tooltip formatter={tooltipFormatter} {...chart.tooltip} />
                <Bar dataKey="revenue" fill={colors[0]} name={t('uiOperations.revenue')} radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" fill={colors[2]} name={t('uiOperations.collectedByPaymentDate')} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Dentist */}
        <Card title={t('uiOperations.revenueByDentist')}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dentistChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke={chart.axis} tickFormatter={(v) => vndCompact(Number(v))} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke={chart.axis} width={80} />
                <Tooltip formatter={tooltipFormatter} {...chart.tooltip} />
                <Bar dataKey="revenue" fill={colors[0]} name={t('uiOperations.revenue')} radius={[0, 4, 4, 0]} />
                <Bar dataKey="paid" fill={colors[2]} name={t('uiOperations.collected')} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue by Procedure */}
        <Card title={t('uiOperations.revenueByProcedure')}>
          <div className="h-64">
            {byProcedureError ? (
              <ChartErrorNotice onRetry={() => refetchByProcedure()} />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={procedureChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke={chart.axis} tickFormatter={(v) => vndCompact(Number(v))} />
                <YAxis type="category" dataKey="procedure" tick={{ fontSize: 12 }} stroke={chart.axis} width={100} />
                <Tooltip formatter={tooltipFormatter} {...chart.tooltip} />
                <Bar dataKey="revenue" fill={colors[1]} name={t('uiOperations.revenue')} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Revenue by Payment Method */}
      <Card title={t('uiOperations.collectedByMethod')}>
        <div className="space-y-3">
          {paymentChartData.map((method) => (
            <div key={method.method} className="flex items-center gap-4">
              <div className="w-28 text-sm font-medium text-gray-700 dark:text-gray-300">
                {method.method}
              </div>
              <div className="flex-1">
                <div className="h-6 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded bg-brand-500 transition-all"
                    style={{ width: `${Math.max(method.percent, 0)}%` }}
                  />
                </div>
              </div>
              <div className="w-36 text-right text-sm font-medium text-gray-900 dark:text-white">
                {formatCurrency(method.amount)}
              </div>
              <div className="w-16 text-right text-sm text-gray-500 dark:text-gray-400">
                {formatPercent(method.percent / 100, 1)}
              </div>
              <div className="w-16 text-right text-xs text-gray-400">
                {method.count} {t('uiOperations.times')}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue by Source */}
      {/* Also render on error (not just when there's data) — otherwise a
          failed query and a genuinely-empty period both silently hid the
          whole card, with no way to tell which happened or to retry. */}
      {(sourceChartData.length > 0 || bySourceError) && (
        <Card title={t('uiOperations.revenueByBookingSource')}>
          <div className="h-64">
            {bySourceError ? (
              <ChartErrorNotice onRetry={() => refetchBySource()} />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke={chart.axis} tickFormatter={(v) => vndCompact(Number(v))} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 12 }} stroke={chart.axis} width={100} />
                <Tooltip formatter={tooltipFormatter} {...chart.tooltip} />
                <Bar dataKey="revenue" fill={colors[2]} name={t('uiOperations.revenue')} radius={[0, 4, 4, 0]}>
                  {sourceChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </Card>
      )}
      </>
      )}

      {/* Outstanding Aging Report */}
      {canSeeOutstanding && (
      <Card
        title={t('uiOperations.outstandingAgingReport')}
        description={t('uiOperations.outstandingAsOfToday', { count: outstandingList.length })}
      >
        {/* Aging summary */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {AGING_COLUMNS.map(({ bucket, key, color }) => {
            const items = byBucket(bucket);
            return (
              <div key={bucket} className={`rounded-lg p-3 ${color}`}>
                <p className="text-xs font-medium">{t(`uiOperations.${key}`)}</p>
                <p className="text-lg font-semibold">{items.length}</p>
                <p className="text-xs">
                  {formatCurrency(items.reduce((s, i) => s + i.outstanding, 0))}
                </p>
              </div>
            );
          })}
        </div>

        {/* Outstanding table */}
        {outstandingList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.invoiceCode')}</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.patient')}</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.phone')}</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.visitDate')}</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.outstanding')}</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.issuedDate')}</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">{t('uiOperations.daysPastDue')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedOutstanding.slice(0, 50).map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.code}</td>
                    <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                      {item.patient.fullName}
                      <span className="ml-2 text-xs text-gray-400">({item.patient.code})</span>
                    </td>
                    <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                      {item.patient.phone ? (
                        <a href={`tel:${item.patient.phone}`} className="hover:underline">{item.patient.phone}</a>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">
                      {clinicDateLabel(item.visitDate)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                      {formatCurrency(item.outstanding)}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">
                      {clinicDateLabel(item.issuedAt)}
                    </td>
                    <td className={`py-2 px-3 text-right ${
                      item.daysOld > 90 ? 'text-red-600 dark:text-red-400' :
                      item.daysOld > 60 ? 'text-orange-600 dark:text-orange-400' :
                      item.daysOld > 30 ? 'text-amber-600 dark:text-amber-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {item.daysOld} {t('uiOperations.days')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outstandingList.length > 50 && (
              <p className="text-center py-2 text-sm text-gray-500">
                {t('uiOperations.show50of', { count: outstandingList.length })}
              </p>
            )}
          </div>
        ) : outstandingError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
            <span>{t('uiOperations.outstandingLoadFailed')}</span>
            <button
              onClick={() => refetchOutstanding()}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              {t('uiOperations.retry')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <DollarSign className="h-12 w-12 mb-2" />
            <p>{t('uiOperations.noOutstanding')}</p>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
