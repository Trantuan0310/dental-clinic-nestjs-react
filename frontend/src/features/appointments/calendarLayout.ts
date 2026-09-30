import type { Appointment, ClockInterval } from '@/types/appointment';
import { clinicIso, clinicMinutes } from '@/lib/clinicTime';

/** Default day/week grid, widened to fit bookings or working hours outside it. */
export const DEFAULT_HOUR_START = 7;
export const DEFAULT_HOUR_END = 19;
export const HOUR_HEIGHT_PX = 56; // visual height of a 1-hour row
/** Blocks are at least this tall (px) so short visits stay clickable. */
export const MIN_BLOCK_PX = 24;

const DAY_MIN = 24 * 60;

/** Clinic start/end minutes of a booking; an end past midnight counts as 24:00. */
export function appointmentSpan(apt: Pick<Appointment, 'startsAt' | 'endsAt'>): {
  start: number;
  end: number;
} {
  const start = clinicMinutes(apt.startsAt);
  let end = clinicMinutes(apt.endsAt);
  const crossesMidnight =
    new Date(apt.endsAt).getTime() - new Date(apt.startsAt).getTime() >= (DAY_MIN - start) * 60_000;
  if (end <= start || crossesMidnight) end = DAY_MIN;
  return { start, end };
}

const hhmmToMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Hours shown by the day/week grid: 07–19 by default, widened (never
 * clamped) to the earliest start and latest end of the bookings and working
 * windows in view, so nothing is squeezed onto the grid's edge.
 */
export function visibleHourRange(
  appointments: Pick<Appointment, 'startsAt' | 'endsAt'>[],
  windows: ClockInterval[] = [],
): { hourStart: number; hourEnd: number } {
  let startMin = DEFAULT_HOUR_START * 60;
  let endMin = DEFAULT_HOUR_END * 60;
  for (const apt of appointments) {
    const { start, end } = appointmentSpan(apt);
    startMin = Math.min(startMin, start);
    endMin = Math.max(endMin, end);
  }
  for (const w of windows) {
    startMin = Math.min(startMin, hhmmToMin(w.startTime));
    endMin = Math.max(endMin, hhmmToMin(w.endTime));
  }
  return {
    hourStart: Math.max(0, Math.floor(startMin / 60)),
    hourEnd: Math.min(24, Math.ceil(endMin / 60)),
  };
}

export interface LaneSlot {
  lane: number;
  lanes: number;
}

/**
 * Side-by-side lanes for bookings that overlap on screen (same hour, two
 * dentists, or a double booking): each block gets a lane, and every block
 * of an overlapping cluster shares the cluster's lane count, so blocks sit
 * next to each other instead of on top. `minMinutes` is the visual minimum
 * height, so tiny blocks that touch on screen are split too.
 */
export function layoutLanes(
  appointments: Pick<Appointment, 'id' | 'startsAt' | 'endsAt'>[],
  minMinutes = 0,
): Map<string, LaneSlot> {
  const items = appointments
    .map((a) => {
      const { start, end } = appointmentSpan(a);
      return { id: a.id, start, end: Math.max(end, start + minMinutes) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  const result = new Map<string, LaneSlot>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((c) => result.set(c.id, { lane: c.lane, lanes }));
    cluster = [];
    laneEnds = [];
  };

  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ id: item.id, lane });
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

/** True once the whole clinic hour `hour` of `date` ("yyyy-MM-dd") has passed. */
export function isHourPast(date: string, hour: number, now: number): boolean {
  const start = new Date(clinicIso(date, `${String(hour).padStart(2, '0')}:00`)).getTime();
  return start + 60 * 60_000 <= now;
}

/** Clinic dates in [from, to] (both "yyyy-MM-dd") covered by closures, with their reason. */
export function closedDaysInRange(
  closures: { startDate: string; endDate: string; reason: string }[],
  from: string,
  to: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of closures) {
    const start = c.startDate.slice(0, 10);
    const end = c.endDate.slice(0, 10);
    // Walk UTC days: "yyyy-MM-dd" strings, no local-zone shift.
    for (
      let d = new Date(`${start > from ? start : from}T00:00:00Z`);
      d.toISOString().slice(0, 10) <= (end < to ? end : to);
      d = new Date(d.getTime() + DAY_MIN * 60_000)
    ) {
      out[d.toISOString().slice(0, 10)] = c.reason;
    }
  }
  return out;
}
