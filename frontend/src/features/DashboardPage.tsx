// =============================================================================
// Dashboard page — composes lazy-loaded card modules
// Each card is in ./cards.tsx (and could be split further with React.lazy()
// if the bundle grows). This file owns: state, data fetching, layout.
// =============================================================================
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { useTodayAppointments } from '@/features/appointments/appointmentApi';
import { useAuthStore } from '@/stores/authStore';
import { formatTimeOnly } from '@/lib/format';
import { resolveRange, type TimeRange } from './dashboard/types';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { AiSummaryCard } from './dashboard/AiSummaryCard';
import {
  AppointmentStatsCard,
  AppointmentsCard,
  DentistRankingCard,
  FinanceCard,
  OutstandingCard,
  SourceCard,
} from './dashboard/cards';
import {
  KpiRow,
  LazyCustomerTypeCard,
  LazyDailyChartCard,
  LazyMonthlyChartCard,
  LazyProcedureCard,
} from './dashboard/lazyCards';

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('today');

  const dateRange = useMemo(() => resolveRange(range), [range]);
  const commonParams = { from: dateRange.from, to: dateRange.to };

  // Each widget is gated by the canonical code its endpoint checks; FE alias
  // codes (report.read, appointment.read) only open menus (A6-25). Gating the
  // fetch avoids a red error card per widget for roles without access.
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canSeeRevenue = hasPermission('report.revenue.read');
  const canSeeAppointmentsByDay = hasAnyPermission(['appointment.read.any', 'appointment.read.own']);
  // A dentist's appointment widgets cover their own calendar only (A6-18).
  const ownAppointmentsOnly = !hasPermission('appointment.read.any');
  const canSeeOutstanding = hasPermission('report.outstanding.read');

  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
    refetch: refetchKpis,
  } = useQuery({
    queryKey: ['dashboard-kpis', dateRange],
    queryFn: () => dashboardApi.kpis(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: revenueByDay,
    isLoading: revenueByDayLoading,
    isError: revenueByDayError,
    refetch: refetchRevenueByDay,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-day', dateRange],
    queryFn: () => dashboardApi.revenueByDay(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: revenueBySource,
    isLoading: revenueBySourceLoading,
    isError: revenueBySourceError,
    refetch: refetchRevenueBySource,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-source', dateRange],
    queryFn: () => dashboardApi.revenueBySource(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: revenueByProcedure,
    isLoading: revenueByProcedureLoading,
    isError: revenueByProcedureError,
    refetch: refetchRevenueByProcedure,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-procedure', dateRange],
    queryFn: () => dashboardApi.revenueByProcedure(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: revenueByDentist,
    isLoading: revenueByDentistLoading,
    isError: revenueByDentistError,
    refetch: refetchRevenueByDentist,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-dentist', dateRange],
    queryFn: () => dashboardApi.revenueByDentist(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: revenueByCustomerType,
    isLoading: revenueByCustomerTypeLoading,
    isError: revenueByCustomerTypeError,
    refetch: refetchRevenueByCustomerType,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-customer-type', dateRange],
    queryFn: () => dashboardApi.revenueByCustomerType(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: appointmentStats,
    isLoading: appointmentStatsLoading,
    isError: appointmentStatsError,
    refetch: refetchAppointmentStats,
  } = useQuery({
    // Under the ['appointments'] prefix so every booking mutation refreshes it.
    queryKey: ['appointments', 'dashboard-stats', dateRange],
    queryFn: () => dashboardApi.appointmentStats(commonParams),
    enabled: canSeeAppointmentsByDay,
  });

  const {
    data: revenueByMonth,
    isLoading: revenueByMonthLoading,
    isError: revenueByMonthError,
    refetch: refetchRevenueByMonth,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-month'],
    queryFn: () => dashboardApi.revenueByMonth(),
    enabled: canSeeRevenue,
  });

  const {
    data: appointmentsByDay,
    isLoading: appointmentsByDayLoading,
    isError: appointmentsByDayError,
    refetch: refetchAppointmentsByDay,
  } = useQuery({
    // Under the ['appointments'] prefix so every booking mutation refreshes it.
    queryKey: ['appointments', 'dashboard-by-day', dateRange],
    queryFn: () => dashboardApi.appointmentsByDay(commonParams),
    enabled: canSeeAppointmentsByDay,
  });

  const {
    data: finance,
    isLoading: financeLoading,
    isError: financeError,
    refetch: refetchFinance,
  } = useQuery({
    queryKey: ['dashboard-finance-summary', dateRange],
    queryFn: () => dashboardApi.financeSummary(commonParams),
    enabled: canSeeRevenue,
  });

  const {
    data: outstanding,
    isLoading: outstandingLoading,
    isError: outstandingError,
    refetch: refetchOutstanding,
  } = useQuery({
    queryKey: ['dashboard-outstanding'],
    queryFn: () => dashboardApi.outstanding(),
    enabled: canSeeOutstanding,
  });

  const { data: todayAppointments } = useTodayAppointments();
  // One entry per appointment, not per patient — a patient with two
  // appointments today (common: two separate procedures, or a follow-up
  // later the same day) produced two <option>s sharing the same
  // patientId key, which React warned about ("two children with the
  // same key") and let the dropdown show the same patient name twice.
  // Dedupe by patientId, keeping the first (earliest, since today's
  // appointments come back time-ordered) occurrence.
  const seenPatientIds = new Set<string>();
  const aiPatientOptions = (todayAppointments?.data ?? [])
    .map((a) => ({
      id: a.patientId,
      label: a.patientName ? `${a.patientName} (${a.startsAt ? formatTimeOnly(a.startsAt) : ''})` : 'Bệnh nhân',
    }))
    .filter((opt) => {
      if (!opt.id || seenPatientIds.has(opt.id)) return false;
      seenPatientIds.add(opt.id);
      return true;
    });

  return (
    <div className="space-y-4">
      <DashboardHeader range={range} setRange={setRange} />

      {/* Row 1 — KPI metrics (report.revenue.read) */}
      {canSeeRevenue && (
        <KpiRow
          kpis={kpis}
          range={range}
          isLoading={kpisLoading}
          isError={kpisError}
          onRetry={refetchKpis}
        />
      )}

      {/* Row 1.2 — appointment outcomes; the front desk's KPIs for today */}
      {canSeeAppointmentsByDay && (
        <AppointmentStatsCard
          stats={appointmentStats}
          range={range}
          isLoading={appointmentStatsLoading}
          isError={appointmentStatsError}
          onRetry={refetchAppointmentStats}
        />
      )}

      {/* Row 1.5 — AI tóm tắt hồ sơ bệnh nhân */}
      <AiSummaryCard patientOptions={aiPatientOptions} />

      {/* Row 2 — Customer mix + Source breakdown */}
      {canSeeRevenue && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-5">
            <LazyCustomerTypeCard
              rows={revenueByCustomerType ?? []}
              isLoading={revenueByCustomerTypeLoading}
              isError={revenueByCustomerTypeError}
              onRetry={refetchRevenueByCustomerType}
            />
          </div>
          <div className="md:col-span-7">
            <SourceCard
              rows={revenueBySource ?? []}
              isLoading={revenueBySourceLoading}
              isError={revenueBySourceError}
              onRetry={refetchRevenueBySource}
            />
          </div>
        </div>
      )}

      {/* Row 3 — Procedure revenue + Dentist ranking */}
      {canSeeRevenue && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-6">
            <LazyProcedureCard
              rows={revenueByProcedure ?? []}
              isLoading={revenueByProcedureLoading}
              isError={revenueByProcedureError}
              onRetry={refetchRevenueByProcedure}
            />
          </div>
          <div className="md:col-span-6">
            <DentistRankingCard
              rows={revenueByDentist ?? []}
              isLoading={revenueByDentistLoading}
              isError={revenueByDentistError}
              onRetry={refetchRevenueByDentist}
            />
          </div>
        </div>
      )}

      {/* Row 4 — Daily 15-day chart */}
      {canSeeRevenue && (
        <LazyDailyChartCard
          rows={revenueByDay ?? []}
          range={range}
          isLoading={revenueByDayLoading}
          isError={revenueByDayError}
          onRetry={refetchRevenueByDay}
        />
      )}

      {/* Row 5 — Monthly trend + Appointments */}
      {(canSeeRevenue || canSeeAppointmentsByDay) && (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-12">
          {canSeeRevenue && (
            <div className="lg:col-span-8">
              <LazyMonthlyChartCard
                rows={revenueByMonth ?? []}
                isLoading={revenueByMonthLoading}
                isError={revenueByMonthError}
                onRetry={refetchRevenueByMonth}
              />
            </div>
          )}
          {canSeeAppointmentsByDay && (
            <div className={canSeeRevenue ? 'lg:col-span-4' : 'lg:col-span-12'}>
              <AppointmentsCard
                rows={appointmentsByDay ?? []}
                range={range}
                ownOnly={ownAppointmentsOnly}
                isLoading={appointmentsByDayLoading}
                isError={appointmentsByDayError}
                onRetry={refetchAppointmentsByDay}
              />
            </div>
          )}
        </div>
      )}

      {/* Row 6 — Finance summary + Outstanding debt */}
      {(canSeeRevenue || canSeeOutstanding) && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
          {canSeeRevenue && (
            <div className={canSeeOutstanding ? 'md:col-span-8' : 'md:col-span-12'}>
              <FinanceCard
                finance={finance}
                isLoading={financeLoading}
                isError={financeError}
                onRetry={refetchFinance}
              />
            </div>
          )}
          {canSeeOutstanding && (
            <div className={canSeeRevenue ? 'md:col-span-4' : 'md:col-span-12'}>
              <OutstandingCard
                outstanding={outstanding}
                isLoading={outstandingLoading}
                isError={outstandingError}
                onRetry={refetchOutstanding}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
