import { useEffect, useState } from 'react';
import type { Appointment } from '@/types/appointment';

/**
 * Keeping appointment screens current while the front desk works.
 *
 * Refetch-on-focus stays off globally (queryClient.ts): on form-heavy pages a
 * background refetch can reset what is being edited. Appointment lists and
 * calendars only display data, so they opt in here — and while they show
 * today they also re-read every minute, since check-ins, no-shows and
 * cancellations from other desks change them all day.
 */
export const LIVE_REFRESH_MS = 60_000;

/** Booked, not arrived, and this late after the start counts as overdue (matches LATE_AFTER_MIN). */
export const OVERDUE_AFTER_MIN = 15;
export const OVERDUE_LABEL = 'Quá giờ – chưa đến';
/** Calendar block colours for an overdue booking (replaces the status colours). */
export const OVERDUE_BLOCK_CLASS = 'bg-rose-50 border-rose-500 text-rose-800';
/** Dot colour for an overdue booking in compact views. */
export const OVERDUE_DOT_CLASS = 'bg-rose-600';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A bare date is a clinic day (+07:00); anything else is an instant.
function edge(value: string, end: boolean): number {
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}+07:00`).getTime();
  }
  return new Date(value).getTime();
}

/** True when the [from, to] range (either end open) contains `now`. */
export function rangeIncludesNow(from?: string, to?: string, now = Date.now()): boolean {
  if (from && edge(from, false) > now) return false;
  if (to && edge(to, true) < now) return false;
  return true;
}

/** Query options for appointment lists/calendars covering `range`. */
export function liveAppointmentQuery(range?: { from?: string; to?: string }) {
  return {
    refetchOnWindowFocus: true,
    // Re-evaluated after every fetch, so it stops after midnight on its own.
    refetchInterval: () => (rangeIncludesNow(range?.from, range?.to) ? LIVE_REFRESH_MS : false),
  } as const;
}

/**
 * Booked (scheduled/confirmed) but not checked in, more than
 * OVERDUE_AFTER_MIN after the start: the front desk should call the patient,
 * check them in late, or mark them absent.
 */
export function isOverdueNotArrived(
  apt: Pick<Appointment, 'status' | 'startsAt'>,
  now = Date.now(),
): boolean {
  if (apt.status !== 'scheduled' && apt.status !== 'confirmed') return false;
  return now > new Date(apt.startsAt).getTime() + OVERDUE_AFTER_MIN * 60_000;
}

/** Minutes past the booked start (0 before it). */
export function minutesLate(startsAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startsAt).getTime()) / 60_000));
}

/** The current time, updated every `intervalMs` so time-based labels move on. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
