// Dashboard KPI + report aggregations imperative API. The DashboardPage
// uses these directly inside React Query callbacks. Located under
// features/dashboard/ as the canonical home (the legacy src/api/dashboard.ts
// was a re-export of this file).

import { api } from '@/lib/api';
import type {
  AppointmentPoint,
  DashboardKpis,
  DailyRevenuePoint,
  FinanceSummary,
  MonthlyRevenuePoint,
  OutstandingSummary,
  RevenueByDentistRow,
  RevenueByProcedure,
  RevenueBySource,
} from '@/types/dashboard';

export interface RangeQuery {
  from?: string;
  to?: string;
}

function range(q: RangeQuery) {
  const params: Record<string, string> = {};
  if (q.from) params.from = q.from;
  if (q.to) params.to = q.to;
  return { params };
}

export const dashboardApi = {
  kpis: async (q: RangeQuery): Promise<DashboardKpis> => {
    const { data } = await api.get<DashboardKpis>('/billing/reports/dashboard-kpis', range(q));
    return data;
  },

  revenueByDay: async (q: RangeQuery): Promise<DailyRevenuePoint[]> => {
    const { data } = await api.get<{ data: DailyRevenuePoint[] }>(
      '/billing/reports/revenue-by-day',
      range(q),
    );
    return data.data;
  },

  revenueBySource: async (q: RangeQuery): Promise<RevenueBySource[]> => {
    const { data } = await api.get<{ data: RevenueBySource[] }>(
      '/billing/reports/revenue-by-source',
      range(q),
    );
    return data.data;
  },

  revenueByProcedure: async (q: RangeQuery): Promise<RevenueByProcedure[]> => {
    const { data } = await api.get<{ data: RevenueByProcedure[] }>(
      '/billing/reports/revenue-by-procedure',
      range(q),
    );
    return data.data;
  },

  revenueByDentist: async (q: RangeQuery): Promise<RevenueByDentistRow[]> => {
    const { data } = await api.get<{ data: RevenueByDentistRow[] }>(
      '/billing/reports/revenue-by-dentist',
      range(q),
    );
    return data.data;
  },

  revenueByMonth: async (): Promise<MonthlyRevenuePoint[]> => {
    const { data } = await api.get<{ data: MonthlyRevenuePoint[] }>('/billing/reports/revenue-by-month');
    return data.data;
  },

  appointmentsByDay: async (q: RangeQuery): Promise<AppointmentPoint[]> => {
    const { data } = await api.get<{ data: AppointmentPoint[] }>(
      '/billing/reports/appointments-by-day',
      range(q),
    );
    return data.data;
  },

  financeSummary: async (q: RangeQuery): Promise<FinanceSummary> => {
    const { data } = await api.get<FinanceSummary>('/billing/reports/finance-summary', range(q));
    return data;
  },

  outstanding: async (): Promise<OutstandingSummary> => {
    const { data } = await api.get<OutstandingSummary>('/billing/reports/outstanding-summary');
    return data;
  },
};