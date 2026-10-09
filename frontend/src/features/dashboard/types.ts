// =============================================================================
// Dashboard shared types + helpers
// =============================================================================
import type { ReactNode } from 'react';
import { format, startOfMonth, subDays, subMonths } from 'date-fns';
import { clinicWallClock } from '@/lib/clinicTime';

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
    sparkline?: Array<{ date: string; value: number }>;
  };
  /** total excludes cancellations; arrived = patient came (final status). */
  appointments: { total: number; pctChange: number; arrived?: number; cancelled?: number };
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
  /** Appointments that were not cancelled. */
  count: number;
  arrived?: number;
  noShow?: number;
  cancelled?: number;
}

/** Outcome tallies by final status (backend appointment-stats, A6-12). */
export interface AppointmentTally {
  total: number;
  pending: number;
  arrived: number;
  inClinic: number;
  completed: number;
  left: number;
  noShow: number;
  cancelled: number;
  cancelledAfterCheckIn: number;
}

export interface AppointmentStats {
  from: string;
  to: string;
  dentistId: string | null;
  scope: 'own' | 'all';
  summary: AppointmentTally & { walkIn: number; online: number };
  rates: { arrivalPct: number; noShowPct: number; cancelPct: number; leftPct: number };
  bySource: Array<AppointmentTally & { source: string; sourceLabel: string }>;
  byDentist: Array<AppointmentTally & { dentistId: string; dentistName: string }>;
  /** Junk requests excluded; patient cancellations kept apart from the clinic's. */
  onlineFunnel: {
    requests: number;
    booked: number;
    arrived: number;
    patientCancelled: number;
    declined: number;
    expired: number;
    spam: number;
  } | null;
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

/** Computed by the backend from real invoices (A6-13). */
export interface RevenueByCustomerType {
  type: CustomerType;
  revenue: number;
  percentage: number;
  count: number;
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

/** Short label for card titles ("Lịch hẹn 7 ngày qua"). */
export const RANGE_TITLES: Record<TimeRange, string> = {
  today: 'hôm nay',
  '7d': '7 ngày qua',
  '15d': '15 ngày qua',
  '30d': '30 ngày qua',
  '6m': '6 tháng qua',
};

export const RANGE_DESCRIPTIONS: Record<TimeRange, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày qua',
  '15d': '15 ngày qua',
  '30d': '30 ngày qua',
  '6m': '6 tháng qua',
};

/** Dates on the clinic calendar, whatever the workstation's time zone (A6-18). */
export function resolveRange(range: TimeRange, today = clinicWallClock()): DateRange {
  const to = format(today, 'yyyy-MM-dd');
  const startOf = (daysAgo: number) =>
    format(subDays(today, daysAgo), 'yyyy-MM-dd');
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
      from = format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd');
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

export interface CardScaffoldProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}
