import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { clinicWallClock } from './clinicTime';

/**
 * What a value shows as, in clinic time (Asia/Ho_Chi_Minh):
 * - a timestamp string ("…T…") is an instant → the clinic's wall clock;
 * - a date-only string ("yyyy-MM-dd") is a calendar date → that date, with
 *   no time-zone shift (new Date('2026-09-25') is UTC midnight, which is the
 *   day before in a browser west of UTC);
 * - a Date object is taken as already meant for display (calendar grids
 *   build these from clinic dates).
 */
function toDisplayDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? instant : clinicWallClock(instant);
}

export function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' ₫';
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function formatPct(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(digits)}%`;
}

export function formatDate(value: string | Date | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!value) return '—';
  const date = toDisplayDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern, { locale: vi });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'dd/MM/yyyy HH:mm');
}

export function formatMonthYear(value: string | Date | null | undefined): string {
  return formatDate(value, 'MM/yyyy');
}

export function diffHours(from: string | Date, to: string | Date): number {
  const f = from instanceof Date ? from : new Date(from);
  const t = to instanceof Date ? to : new Date(to);
  return (t.getTime() - f.getTime()) / (1000 * 60 * 60);
}

// -----------------------------------------------------------------------------
// Helpers for the Appointments module
// -----------------------------------------------------------------------------

const WEEKDAY_LABELS_VI = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];

export function getWeekdayLabel(date: Date | string): string {
  return WEEKDAY_LABELS_VI[toDisplayDate(date).getDay()] ?? '';
}

export function formatTimeOnly(value: string | Date | null | undefined): string {
  return formatDate(value, 'HH:mm');
}

export function formatDateTimeShort(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return digits;
  // Format 3-3-3: 0912 345 678
  const last = digits.slice(-3);
  const mid = digits.slice(-6, -3);
  const head = digits.slice(0, -6);
  return [head, mid, last].filter(Boolean).join(' ');
}

// Aliases for compatibility
export const formatCurrency = formatVnd;
export const formatNumberShort = formatNumber;
export const formatPercent = formatPct;