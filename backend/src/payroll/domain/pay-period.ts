import { clinicDateOnly, startOfClinicDay } from '../../common/date-range.util';
import { DayCalendar, Interval, mergeWindows } from '../../appointments/domain/day-calendar';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of a DATE column value (Prisma returns UTC midnight). */
export const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Instants covered by a pay period: its first clinic day 00:00 (Asia/Ho_Chi_Minh)
 * up to, but not including, the clinic day after its last one. Comparing an
 * instant to the DATE columns directly lost everything after 07:00 on the
 * last day (A6-01 / A2-04 / A1-03).
 */
export function periodInstantRange(period: { start: Date; end: Date }): {
  from: Date;
  toExclusive: Date;
} {
  return {
    from: startOfClinicDay(dateKey(period.start)),
    toExclusive: new Date(startOfClinicDay(dateKey(period.end)).getTime() + DAY_MS),
  };
}

/** Clinic date keys of the period, first to last. */
export function periodDateKeys(period: { start: Date; end: Date }): string[] {
  const keys: string[] = [];
  const last = new Date(dateKey(period.end)).getTime();
  for (let t = new Date(dateKey(period.start)).getTime(); t <= last; t += DAY_MS) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/** DATE-column value (UTC midnight) of the clinic day an instant falls on. */
export const clinicDateValue = (instant: Date): Date => new Date(clinicDateOnly(instant));

/**
 * Commission basis of each invoice line: its line total after the invoice
 * discount, shared pro rata (line × total / subtotal). Rounded to whole đồng
 * with the leftover đồng going to the largest remainders, so the lines add
 * up to the rounded invoice total exactly.
 */
export function allocateInvoiceBasis(
  items: Array<{ id: string; lineTotal: number }>,
  subtotal: number,
  total: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (subtotal <= 0 || total <= 0) {
    for (const i of items) out.set(i.id, 0);
    return out;
  }
  const ratio = total / subtotal;
  const raw = items.map(i => ({ id: i.id, value: Math.max(i.lineTotal, 0) * ratio }));
  const target = Math.round(raw.reduce((s, r) => s + r.value, 0));
  const floors = raw.map(r => ({ id: r.id, base: Math.floor(r.value), frac: r.value % 1 }));
  let left = target - floors.reduce((s, f) => s + f.base, 0);
  for (const f of [...floors].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    f.base += 1;
    left -= 1;
  }
  for (const f of floors) out.set(f.id, f.base);
  return out;
}

/** a minus every interval in `cut` (both sorted or not). */
function subtract(a: Interval[], cut: Interval[]): Interval[] {
  let pieces = a.map(w => ({ start: w.start, end: w.end }));
  for (const c of mergeWindows(cut)) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (c.end <= p.start || c.start >= p.end) {
        next.push(p);
        continue;
      }
      if (c.start > p.start) next.push({ start: p.start, end: c.start });
      if (c.end < p.end) next.push({ start: c.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
}

/**
 * Paid working time of one day: the windows the booking calendar opens
 * (weekly schedule or CHANGED_HOURS, plus approved shifts; none on a CLOSED
 * day or a clinic closure) minus closed ranges and approved time-off
 * (owner decision: approved leave and closed days are unpaid).
 */
export function paidIntervals(cal: DayCalendar): Interval[] {
  return subtract(cal.windows, cal.blocked);
}

export const minutesOf = (xs: Interval[]): number =>
  xs.reduce((s, x) => s + (x.end.getTime() - x.start.getTime()) / 60_000, 0);

/** Minutes of `span` outside the paid intervals (visit run past hours, walk-in after closing). */
export function minutesOutside(paid: Interval[], span: Interval): number {
  if (span.end <= span.start) return 0;
  return Math.round(minutesOf(subtract([span], paid)));
}
