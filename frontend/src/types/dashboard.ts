// Dashboard analytics — payload types matching backend billing/reports endpoints.

export type TimeRange = 'today' | '7d' | '15d' | '30d' | '6m';

export interface DateRange {
  from: string; // ISO yyyy-MM-dd
  to: string;
}

export interface KpiDelta {
  total: number;
  newCount?: number;
  returningCount?: number;
  pctChange: number; // % vs previous equivalent period
  /** Daily series used to render the sparkline. */
  sparkline?: SparklinePoint[];
}

export interface DashboardKpis {
  patients: KpiDelta;
  appointments: KpiDelta;
  treatmentRevenue: KpiDelta;
  collected: KpiDelta;
}

export interface SparklinePoint {
  date: string; // yyyy-MM-dd
  value: number;
}

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  invoiceCount: number;
}

export interface MonthlyRevenuePoint {
  month: string; // yyyy-MM
  revenue: number;
}

export interface AppointmentPoint {
  date: string;
  count: number;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
}

export interface OutstandingSummary {
  totalDebt: number;
  invoiceCount: number;
}

export type CustomerType = 'NEW' | 'RETURNING';

export interface RevenueByCustomerType {
  type: CustomerType;
  revenue: number;
  percentage: number;
}

export type AppointmentSource = 'WALK_IN' | 'PHONE' | 'ONLINE' | 'RETURNING';

export interface RevenueBySource {
  source: AppointmentSource | string;
  sourceLabel: string;
  revenue: number;
  percentage: number;
  count: number;
}

export interface RevenueByProcedure {
  procedure: string;
  revenue: number;
  count: number;
}

export interface RevenueByDentistRow {
  dentistId: string;
  dentistName: string;
  revenue: number;
  percentage: number;
  count: number;
}
