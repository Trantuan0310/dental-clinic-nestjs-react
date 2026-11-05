import type { DayCalendar } from '../appointments/domain/day-calendar';

/**
 * Pure calculations behind the capacity heatmap and the scorecard
 * (docs/11_Improvement, B1 and B2). No database access here: the service
 * loads the rows, these functions turn them into numbers.
 */

type Span = [number, number];

const MIN = 60_000;
const HOUR = 60 * MIN;

function merge(spans: Span[]): Span[] {
  const sorted = spans.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** `spans` (merged) without the parts covered by `cuts`. */
function subtract(spans: Span[], cuts: Span[]): Span[] {
  const mergedCuts = merge(cuts);
  const out: Span[] = [];
  for (const [s, e] of spans) {
    let from = s;
    for (const [cs, ce] of mergedCuts) {
      if (ce <= from || cs >= e) continue;
      if (cs > from) out.push([from, cs]);
      from = Math.max(from, ce);
      if (from >= e) break;
    }
    if (from < e) out.push([from, e]);
  }
  return out;
}

/** Parts of merged `a` that lie inside merged `b`. */
function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]);
    const e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

function overlapMs(spans: Span[], from: number, to: number): number {
  let total = 0;
  for (const [s, e] of spans) total += Math.max(0, Math.min(e, to) - Math.max(s, from));
  return total;
}

export interface CapacityCell {
  /** 0 = Sunday … 6 = Saturday, as Date#getUTCDay of the clinic date. */
  weekday: number;
  /** Clinic hour 0–23. */
  hour: number;
  /** Minutes the dentists are open for bookings in this slot, summed over the range. */
  availableMin: number;
  /** Minutes of that time that hold a booking (buffers included, as the calendar does). */
  bookedMin: number;
}

/**
 * Capacity by weekday × clinic hour over many dentist-days. Open time is
 * the working windows minus time-off and closures; booked time is the
 * bookings inside it, so a visit that spills past closing is not counted
 * as utilisation of hours that were never offered.
 */
export function capacityCells(calendars: DayCalendar[]): CapacityCell[] {
  const grid = new Map<string, CapacityCell>();
  for (const cal of calendars) {
    if (cal.windows.length === 0) continue;
    const open = subtract(
      merge(cal.windows.map(w => [w.start.getTime(), w.end.getTime()] as Span)),
      cal.blocked.map(b => [b.start.getTime(), b.end.getTime()] as Span),
    );
    if (open.length === 0) continue;
    const booked = intersect(
      merge(cal.bookings.map(b => [b.start.getTime(), b.end.getTime()] as Span)),
      open,
    );
    const weekday = new Date(`${cal.date}T00:00:00Z`).getUTCDay();
    const dayStart = new Date(`${cal.date}T00:00:00+07:00`).getTime();
    for (let hour = 0; hour < 24; hour++) {
      const from = dayStart + hour * HOUR;
      const to = from + HOUR;
      const availableMs = overlapMs(open, from, to);
      if (availableMs === 0) continue;
      const key = `${weekday}|${hour}`;
      const cell = grid.get(key) ?? { weekday, hour, availableMin: 0, bookedMin: 0 };
      cell.availableMin += availableMs / MIN;
      cell.bookedMin += overlapMs(booked, from, to) / MIN;
      grid.set(key, cell);
    }
  }
  return [...grid.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
}

export type MetricDirection = 'lower' | 'higher';

export interface ScorecardMetric {
  key:
    | 'noShowRate'
    | 'rebookRate'
    | 'planAcceptance'
    | 'medianWait'
    | 'lateCancelRate'
    | 'collectionRate';
  /** null when there is nothing to measure in the range. */
  value: number | null;
  unit: 'percent' | 'minutes';
  /** The good side of the target: `lower` = at or below it. */
  direction: MetricDirection;
  target: number;
  /** The edge of "acceptable": past it the measure is poor. */
  okAt: number;
  numerator: number | null;
  denominator: number | null;
}

/** Targets from the sources in docs/11_Improvement; the wait and collection targets are proposals. */
export const SCORECARD_TARGETS: Record<
  ScorecardMetric['key'],
  { unit: ScorecardMetric['unit']; direction: MetricDirection; target: number; okAt: number }
> = {
  noShowRate: { unit: 'percent', direction: 'lower', target: 5, okAt: 10 },
  rebookRate: { unit: 'percent', direction: 'higher', target: 85, okAt: 70 },
  planAcceptance: { unit: 'percent', direction: 'higher', target: 75, okAt: 60 },
  medianWait: { unit: 'minutes', direction: 'lower', target: 15, okAt: 30 },
  lateCancelRate: { unit: 'percent', direction: 'lower', target: 5, okAt: 10 },
  collectionRate: { unit: 'percent', direction: 'higher', target: 95, okAt: 85 },
};

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Median of a list of numbers, null when empty; rounded to one decimal. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

/**
 * Minutes a patient waited: from the booked time (or the check-in, when
 * later, so an early arrival is not counted as waiting) to the start of the
 * exam. Null for an impossible or day-long value (a visit left open).
 */
export function waitMinutes(bookedAt: Date, checkedInAt: Date, startedAt: Date): number | null {
  const from = Math.max(bookedAt.getTime(), checkedInAt.getTime());
  const minutes = (startedAt.getTime() - from) / MIN;
  return minutes >= 0 && minutes <= 480 ? minutes : null;
}

/** The metric with its target; `value` and counts as measured. */
export function scorecardMetric(
  key: ScorecardMetric['key'],
  value: number | null,
  numerator: number | null = null,
  denominator: number | null = null,
): ScorecardMetric {
  return { key, value, numerator, denominator, ...SCORECARD_TARGETS[key] };
}

/** A cancellation less than 24 hours before the booked time. */
export function isLateCancel(startAt: Date, cancelledAt: Date | null): boolean {
  if (!cancelledAt) return false;
  const ahead = startAt.getTime() - cancelledAt.getTime();
  return ahead < 24 * HOUR;
}
