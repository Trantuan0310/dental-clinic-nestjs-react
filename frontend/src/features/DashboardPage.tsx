// =============================================================================
// Dashboard page — composes lazy-loaded card modules
// Each card is in ./cards.tsx (and could be split further with React.lazy()
// if the bundle grows). This file owns: state, data fetching, layout.
// =============================================================================
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { useTodayAppointments } from '@/features/appointments/appointmentApi';
import { resolveRange, type TimeRange } from './dashboard/types';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { AiSummaryCard } from './dashboard/AiSummaryCard';
import { AppointmentsCard, DentistRankingCard, FinanceCard, OutstandingCard, SourceCard } from './dashboard/cards';
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

  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
    refetch: refetchKpis,
  } = useQuery({
    queryKey: ['dashboard-kpis', dateRange],
    queryFn: () => dashboardApi.kpis(commonParams),
  });

  const {
    data: revenueByDay,
    isLoading: revenueByDayLoading,
    isError: revenueByDayError,
    refetch: refetchRevenueByDay,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-day', dateRange],
    queryFn: () => dashboardApi.revenueByDay(commonParams),
  });

  const {
    data: revenueBySource,
    isLoading: revenueBySourceLoading,
    isError: revenueBySourceError,
    refetch: refetchRevenueBySource,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-source', dateRange],
    queryFn: () => dashboardApi.revenueBySource(commonParams),
  });

  const {
    data: revenueByProcedure,
    isLoading: revenueByProcedureLoading,
    isError: revenueByProcedureError,
    refetch: refetchRevenueByProcedure,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-procedure', dateRange],
    queryFn: () => dashboardApi.revenueByProcedure(commonParams),
  });

  const {
    data: revenueByDentist,
    isLoading: revenueByDentistLoading,
    isError: revenueByDentistError,
    refetch: refetchRevenueByDentist,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-dentist', dateRange],
    queryFn: () => dashboardApi.revenueByDentist(commonParams),
  });

  const {
    data: revenueByMonth,
    isLoading: revenueByMonthLoading,
    isError: revenueByMonthError,
    refetch: refetchRevenueByMonth,
  } = useQuery({
    queryKey: ['dashboard-revenue-by-month'],
    queryFn: () => dashboardApi.revenueByMonth(),
  });

  const {
    data: appointmentsByDay,
    isLoading: appointmentsByDayLoading,
    isError: appointmentsByDayError,
    refetch: refetchAppointmentsByDay,
  } = useQuery({
    queryKey: ['dashboard-appointments-by-day', dateRange],
    queryFn: () => dashboardApi.appointmentsByDay(commonParams),
  });

  const {
    data: finance,
    isLoading: financeLoading,
    isError: financeError,
    refetch: refetchFinance,
  } = useQuery({
    queryKey: ['dashboard-finance-summary', dateRange],
    queryFn: () => dashboardApi.financeSummary(commonParams),
  });

  const {
    data: outstanding,
    isLoading: outstandingLoading,
    isError: outstandingError,
    refetch: refetchOutstanding,
  } = useQuery({
    queryKey: ['dashboard-outstanding'],
    queryFn: () => dashboardApi.outstanding(),
  });

  const { data: todayAppointments } = useTodayAppointments();
  const aiPatientOptions = (todayAppointments?.data ?? [])
    .map((a) => ({
      id: a.patientId,
      label: a.patientName ? `${a.patientName} (${a.startsAt ? new Date(a.startsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''})` : 'Bệnh nhân',
    }))
    .filter((opt) => !!opt.id);

  return (
    <div className="space-y-4">
      <DashboardHeader range={range} setRange={setRange} />

      {/* Row 1 — KPI metrics */}
      <KpiRow
        kpis={kpis}
        range={range}
        isLoading={kpisLoading}
        isError={kpisError}
        onRetry={refetchKpis}
      />

      {/* Row 1.5 — AI tóm tắt hồ sơ bệnh nhân */}
      <AiSummaryCard patientOptions={aiPatientOptions} />

      {/* Row 2 — Customer mix + Source breakdown */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
        <div className="md:col-span-5">
          <LazyCustomerTypeCard
            rows={revenueByDentist ?? []}
            patientNew={kpis?.patients.newCount ?? 0}
            patientReturning={kpis?.patients.returningCount ?? 0}
            isLoading={revenueByDentistLoading || kpisLoading}
            isError={revenueByDentistError || kpisError}
            onRetry={() => {
              refetchRevenueByDentist();
              refetchKpis();
            }}
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

      {/* Row 3 — Procedure revenue + Dentist ranking */}
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

      {/* Row 4 — Daily 15-day chart */}
      <LazyDailyChartCard
        rows={revenueByDay ?? []}
        isLoading={revenueByDayLoading}
        isError={revenueByDayError}
        onRetry={refetchRevenueByDay}
      />

      {/* Row 5 — Monthly trend + Appointments */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LazyMonthlyChartCard
            rows={revenueByMonth ?? []}
            isLoading={revenueByMonthLoading}
            isError={revenueByMonthError}
            onRetry={refetchRevenueByMonth}
          />
        </div>
        <div className="lg:col-span-4">
          <AppointmentsCard
            rows={appointmentsByDay ?? []}
            isLoading={appointmentsByDayLoading}
            isError={appointmentsByDayError}
            onRetry={refetchAppointmentsByDay}
          />
        </div>
      </div>

      {/* Row 6 — Finance summary + Outstanding debt */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
        <div className="md:col-span-8">
          <FinanceCard
            finance={finance}
            isLoading={financeLoading}
            isError={financeError}
            onRetry={refetchFinance}
          />
        </div>
        <div className="md:col-span-4">
          <OutstandingCard
            outstanding={outstanding}
            isLoading={outstandingLoading}
            isError={outstandingError}
            onRetry={refetchOutstanding}
          />
        </div>
      </div>
    </div>
  );
}
