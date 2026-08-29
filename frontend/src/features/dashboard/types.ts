// =============================================================================
// Dashboard shared types + helpers
// =============================================================================
import type { ReactNode } from 'react';

export type TimeRange = 'today' | '7d' | '15d' | '30d' | '6m';
export type CustomerType = 'NEW' | 'RETURNING';

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardKpis {
  patients: {
    total: number;
    pctChange: number;
    newCount?: number;
    returningCount?: number;
    sparkline?: Array<{ date: string; value: number }> | number[];
  };
  appointments: { total: number; pctChange: number };
  treatmentRevenue: { total: number; pctChange: number };
  collected: { total: number; pctChange: number };
}

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  invoiceCount: number;
}

export interface MonthlyRevenuePoint {
  month: string;
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

export interface RevenueBySource {
  source: string;
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
  count: number;
  percentage: number;
}

export interface RevenueByCustomerType {
  type: CustomerType;
  revenue: number;
  percentage: number;
}

export const TEAL = '#0d9488';
export const TEAL_DARK = '#0f766e';
export const TEAL_LIGHT = '#5eead4';
export const ACCENT_AMBER = '#f59e0b';

export const SOURCE_COLORS: Record<string, string> = {
  WALK_IN: TEAL,
  PHONE: '#6366f1',
  ONLINE: ACCENT_AMBER,
  RETURNING: '#10b981',
};

export const RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '15d', label: '15 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '6m', label: '6 tháng' },
];

export const RANGE_DESCRIPTIONS: Record<TimeRange, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày qua',
  '15d': '15 ngày qua',
  '30d': '30 ngày qua',
  '6m': '6 tháng qua',
};

export function resolveRange(range: TimeRange, today = new Date()): DateRange {
  const to = today.toISOString().slice(0, 10);
  const startOf = (daysAgo: number) =>
    new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  let from: string;
  switch (range) {
    case 'today':
      from = to;
      break;
    case '7d':
      from = startOf(6);
      break;
    case '15d':
      from = startOf(14);
      break;
    case '30d':
      from = startOf(29);
      break;
    case '6m': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      from = d.toISOString().slice(0, 10);
      break;
    }
    default: {
      const exhaustive: never = range;
      void exhaustive;
      from = to;
    }
  }
  return { from, to };
}

export function vndCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}tỷ`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}tr`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return Math.round(value).toString();
}

export function formatDayLabel(s: string): string {
  const [, m, d] = s.split('-');
  return m && d ? `${d}/${m}` : s;
}

export function formatMonthLabel(s: string): string {
  const [y, m] = s.split('-');
  return y && m ? `T${m}/${y.slice(2)}` : s;
}

export function buildCustomerTypeSplit(
  rows: RevenueByDentistRow[],
  patientNew: number,
  patientReturning: number,
): RevenueByCustomerType[] {
  const total = rows.reduce((acc, r) => acc + r.revenue, 0);
  const total_patients = patientNew + patientReturning;
  const newShare = total_patients > 0 ? patientNew / total_patients : 0.5;
  return [
    {
      type: 'NEW',
      revenue: Math.round(total * newShare),
      percentage: Math.round(newShare * 1000) / 10,
    },
    {
      type: 'RETURNING',
      revenue: Math.round(total * (1 - newShare)),
      percentage: Math.round((1 - newShare) * 1000) / 10,
    },
  ];
}

export interface CardScaffoldProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}
