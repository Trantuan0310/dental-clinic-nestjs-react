// Dashboard KPI + report aggregations imperative API. The DashboardPage
// uses these directly inside React Query callbacks. Located under
// features/dashboard/ as the canonical home (the legacy src/api/dashboard.ts
// was a re-export of this file).

import { api } from '@/lib/api';
import type { DentistPanel, FinancialWaterfall, KpiThreshold, MonthlyAging } from './financialTypes';
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
import type { AppointmentStats, CapacityHeatmap, PatientFunnel, RevenueByCustomerType, Scorecard } from './types';

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
  thresholds: async (): Promise<KpiThreshold[]> => {
    const { data } = await api.get<{ data: KpiThreshold[] }>('/billing/reports/kpi-thresholds');
    return data.data;
  },
  updateThresholds: async (thresholds: KpiThreshold[]): Promise<KpiThreshold[]> => {
    const { data } = await api.put<{ data: KpiThreshold[] }>('/billing/reports/kpi-thresholds', {
      thresholds: thresholds.map(({ key, target, okAt }) => ({ key, target, okAt })),
    });
    return data.data;
  },
  financialWaterfall: async (q: RangeQuery): Promise<FinancialWaterfall> => {
    const { data } = await api.get<{ data: FinancialWaterfall }>('/billing/reports/financial-waterfall', range(q));
    return data.data;
  },
  dentistPanels: async (q: RangeQuery): Promise<DentistPanel[]> => {
    const { data } = await api.get<{ data: DentistPanel[] }>('/billing/reports/dentist-panels', range(q));
    return data.data;
  },
  monthlyAging: async (q: RangeQuery): Promise<MonthlyAging[]> => {
    const { data } = await api.get<{ data: MonthlyAging[] }>('/billing/reports/monthly-aging', range(q));
    return data.data;
  },
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

  revenueByCustomerType: async (q: RangeQuery): Promise<RevenueByCustomerType[]> => {
    const { data } = await api.get<{ data: RevenueByCustomerType[] }>(
      '/billing/reports/revenue-by-customer-type',
      range(q),
    );
    return data.data;
  },

  appointmentStats: async (q: RangeQuery): Promise<AppointmentStats> => {
    const { data } = await api.get<{ data: AppointmentStats }>(
      '/billing/reports/appointment-stats',
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

  capacityHeatmap: async (q: RangeQuery & { dentistId?: string }): Promise<CapacityHeatmap> => {
    const { params } = range(q);
    if (q.dentistId) params.dentistId = q.dentistId;
    const { data } = await api.get<{ data: CapacityHeatmap }>('/billing/reports/capacity-heatmap', {
      params,
    });
    return data.data;
  },

  scorecard: async (q: RangeQuery): Promise<Scorecard> => {
    const { data } = await api.get<{ data: Scorecard }>('/billing/reports/scorecard', range(q));
    return data.data;
  },

  patientFunnel: async (q: RangeQuery): Promise<PatientFunnel> => {
    const { data } = await api.get<{ data: PatientFunnel }>('/billing/reports/patient-funnel', range(q));
    return data.data;
  },
};
