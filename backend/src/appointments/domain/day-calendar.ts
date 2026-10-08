/**
 * One dentist's bookable day, as pure data (ADR-0009 phase 4).
 *
 * Every rule about "can this dentist see a patient at this time" lives here,
 * so booking, rescheduling, the slot picker, the impact report and (phase 6)
 * dispatch all give the same answer. AvailabilityService only loads the rows
 * and calls these functions; this file does no I/O and is covered by
 * decision-table tests (day-calendar.spec.ts).
 *
 * Times: dates are clinic dates ("YYYY-MM-DD", Asia/Ho_Chi_Minh), "HH:mm"
 * strings are clinic wall-clock, Date values are instants.
 */

export const CLINIC_OFFSET = '+07:00';

export interface Interval {
  start: Date;
  end: Date;
}

export type SlotProblemKind = 'CLOSED' | 'OUTSIDE_WORKING_HOURS' | 'TIME_OFF' | 'SLOT_CONFLICT';

export interface SlotProblem {
  kind: SlotProblemKind;
  message: string;
}

/** Rows as they come from the database, already filtered to the day. */
export interface DayInputs {
  date: string;
  /** Weekly working schedules valid that day (TIME columns → Date at 1970-01-01Z). */
  schedules: Array<{ startTime: Date; endTime: Date; slotDurationMin?: number | null }>;
  /** APPROVED shift registrations for that date ("HH:mm"). */
  shifts: Array<{ startTime: string; endTime: string }>;
  /** Non-deleted schedule overrides for that date. */
  overrides: Array<{
    kind: 'CLOSED' | 'CHANGED_HOURS';
    startTime: Date | null;
    endTime: Date | null;
    reason: string;
  }>;
  /** APPROVED time-off overlapping the day. */
  timeOffs: Array<{ startAt: Date; endAt: Date }>;
  /** Clinic-wide closures (Tết, holidays) covering the day (migration 035). */
  clinicClosures?: Array<{
    reason: string;
    /** Closed only from this clinic time (first day of a mid-day closure, migration 043). */
    startTime?: Date | null;
  }>;
  /** Appointments holding a slot (not CANCELLED/NO_SHOW/LEFT, not deleted). */
  bookings: Array<{
    id: string;
    startAt: Date;
    endAt: Date;
    bufferBeforeMin?: number | null;
    bufferAfterMin?: number | null;
  }>;
}

export interface DayCalendar {
  date: string;
  /** Periods the dentist works; a booking must fit inside one of them. */
  windows: Interval[];
  /** Time-off and closed ranges inside the day. */
  blocked: Array<Interval & { kind: 'TIME_OFF' | 'CLOSED'; reason?: string }>;
  /** The time each booking occupies, buffers included (ADR-0009 D4). */
  bookings: Array<Interval & { id: string }>;
  closedAllDay: boolean;
  closedReason: string | null;
  /** Closed because the whole clinic is (closedReason says why). */
  clinicClosed: boolean;
  changedHours: boolean;
  /** Slot length of the first weekly schedule, else 30. */
  defaultSlotMin: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:mm" of a Postgres TIME value (Prisma returns it at 1970-01-01Z). */
export function timeOfDay(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

/** Instant for a clinic date + clinic "HH:mm". */
export function atClinicTime(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00${CLINIC_OFFSET}`);
}

/** Clinic "HH:mm" of an instant. */
export function clinicHhmm(value: Date): string {
  return timeOfDay(new Date(value.getTime() + 7 * 60 * 60 * 1000));
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export interface Buffers {
  beforeMin?: number;
  afterMin?: number;
}

/** [start - before, end + after]: what a visit keeps the dentist busy for (D4). */
export function occupied(visit: Interval, buffers: Buffers = {}): Interval {
  return {
    start: new Date(visit.start.getTime() - (buffers.beforeMin ?? 0) * 60_000),
    end: new Date(visit.end.getTime() + (buffers.afterMin ?? 0) * 60_000),
  };
}

/**
 * Sorted windows with overlapping or touching ones joined: 08:00-12:00 plus an
 * approved 12:00-13:30 shift is one 08:00-13:30 window, so an 11:30-12:30
 * visit fits.
 */
export function mergeWindows(windows: Interval[]): Interval[] {
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && w.start.getTime() <= last.end.getTime()) {
      if (w.end > last.end) last.end = w.end;
    } else {
      merged.push({ start: w.start, end: w.end });
    }
  }
  return merged;
}

export function buildDayCalendar(i: DayInputs): DayCalendar {
  const clinicClosure = i.clinicClosures?.find(c => !c.startTime);
  // The whole clinic closes from a time of day (power cut from 14:00).
  const clinicFrom = i.clinicClosures?.filter(c => c.startTime) ?? [];
  const nextDay = new Date(atClinicTime(i.date, '00:00').getTime() + 24 * 60 * 60_000);
  const closedAll = i.overrides.find(o => o.kind === 'CLOSED' && !o.startTime);
  const changed = i.overrides.filter(o => o.kind === 'CHANGED_HOURS' && o.startTime && o.endTime);

  // BR-SCH-004: changed hours (one or more blocks, e.g. to keep a lunch
  // break) replace the weekly schedule; approved shifts still add hours
  // (ADR-0009 D3). BR-SCH-003: a closed day has none, nor has a day the
  // whole clinic is closed.
  const weekly = changed.length
    ? changed.map(c => ({ start: timeOfDay(c.startTime!), end: timeOfDay(c.endTime!) }))
    : i.schedules.map(s => ({ start: timeOfDay(s.startTime), end: timeOfDay(s.endTime) }));
  const windows =
    closedAll || clinicClosure
      ? []
      : mergeWindows(
          [...weekly, ...i.shifts.map(s => ({ start: s.startTime, end: s.endTime }))].map(w => ({
            start: atClinicTime(i.date, w.start),
            end: atClinicTime(i.date, w.end),
          })),
        );

  const blocked = [
    ...i.overrides
      .filter(o => o.kind === 'CLOSED' && o.startTime && o.endTime)
      .map(o => ({
        start: atClinicTime(i.date, timeOfDay(o.startTime!)),
        end: atClinicTime(i.date, timeOfDay(o.endTime!)),
        kind: 'CLOSED' as const,
      })),
    ...clinicFrom.map(c => ({
      start: atClinicTime(i.date, timeOfDay(c.startTime!)),
      end: nextDay,
      kind: 'CLOSED' as const,
      reason: `Phòng khám nghỉ: ${c.reason}`,
    })),
    ...i.timeOffs.map(t => ({ start: t.startAt, end: t.endAt, kind: 'TIME_OFF' as const })),
  ];

  return {
    date: i.date,
    windows,
    blocked,
    bookings: i.bookings.map(b => ({
      id: b.id,
      ...occupied(
        { start: b.startAt, end: b.endAt },
        { beforeMin: b.bufferBeforeMin ?? 0, afterMin: b.bufferAfterMin ?? 0 },
      ),
    })),
    closedAllDay: Boolean(closedAll || clinicClosure),
    closedReason: clinicClosure
      ? `Phòng khám nghỉ: ${clinicClosure.reason}`
      : (closedAll?.reason ?? null),
    clinicClosed: Boolean(clinicClosure),
    changedHours: changed.length > 0,
    defaultSlotMin: i.schedules[0]?.slotDurationMin ?? 30,
  };
}

/**
 * Why [start, end) cannot be booked, or null. Checked in this order so the
 * message names the most basic reason: closed day → outside working hours →
 * closed range → time-off → another booking.
 *
 * The visit itself must fit a working window; its buffers (prep before,
 * clean-up after) must not overlap time-off, closed ranges or another
 * booking's occupied time, but may reach past the window edges (D4).
 */
export function intervalProblem(
  cal: DayCalendar,
  slot: Interval,
  opts: { excludeBookingId?: string; ignoreBookings?: boolean; buffers?: Buffers } = {},
): SlotProblem | null {
  if (cal.closedAllDay) {
    return {
      kind: 'CLOSED',
      message: cal.clinicClosed
        ? `${cal.closedReason} (ngày ${cal.date})`
        : `Lịch của bác sĩ đóng cả ngày ${cal.date}`,
    };
  }
  // BR-APPT-003/027: the whole visit fits in one working window (a gap such
  // as lunch between two windows is not bookable).
  if (!cal.windows.some(w => w.start <= slot.start && slot.end <= w.end)) {
    const hours = cal.windows.map(w => `${clinicHhmm(w.start)}-${clinicHhmm(w.end)}`).join(', ');
    return {
      kind: 'OUTSIDE_WORKING_HOURS',
      message: hours
        ? `${clinicHhmm(slot.start)}-${clinicHhmm(slot.end)} nằm ngoài giờ làm việc ${hours}${cal.changedHours ? ' (giờ đã điều chỉnh)' : ''} ngày ${cal.date}`
        : 'Bác sĩ không có lịch làm việc ngày này',
    };
  }
  const busy = occupied(slot, opts.buffers);
  const block = cal.blocked.find(b => overlaps(b, busy));
  if (block) {
    return block.kind === 'CLOSED'
      ? {
          kind: 'CLOSED',
          message: block.reason
            ? `${block.reason} (từ ${clinicHhmm(block.start)} ngày ${cal.date})`
            : `Lịch của bác sĩ đóng ${clinicHhmm(block.start)}-${clinicHhmm(block.end)} ngày ${cal.date}`,
        }
      : {
          kind: 'TIME_OFF',
          message: `Bác sĩ nghỉ phép từ ${clinicHhmm(block.start)} đến ${clinicHhmm(block.end)} ngày ${cal.date}`,
        };
  }
  if (!opts.ignoreBookings) {
    const clash = cal.bookings.find(
      b =>
        (opts.excludeBookingId === undefined || b.id !== opts.excludeBookingId) &&
        overlaps(b, busy),
    );
    if (clash) return { kind: 'SLOT_CONFLICT', message: 'Khung giờ này đã có lịch hẹn' };
  }
  return null;
}

/**
 * Bookable start times ("HH:mm") for a visit of `durationMin`, not before
 * `notBefore`: every round clock time on the `stepMin` grid (:00/:15/:30/:45
 * for 15), whatever the visit's length, plus an off-grid window start (see
 * below).
 */
export function freeSlots(
  cal: DayCalendar,
  durationMin: number,
  stepMin: number,
  notBefore: Date,
  buffers: Buffers = {},
): string[] {
  const stepMs = Math.max(1, stepMin) * 60_000;
  const offsetMs = 7 * 60 * 60 * 1000;
  const slots = new Set<string>();
  for (const w of cal.windows) {
    const lastStart = w.end.getTime() - durationMin * 60_000;
    // First grid time at or after the window start, on the clinic clock.
    const aligned = Math.ceil((w.start.getTime() + offsetMs) / stepMs) * stepMs - offsetMs;
    const starts: number[] = [];
    for (let t = aligned; t <= lastStart; t += stepMs) starts.push(t);
    // An off-grid window start (08:10) is offered only at least half a step
    // before the next grid time (not 08:10 next to 08:15), or when no grid
    // time fits the visit at all.
    if (
      aligned > w.start.getTime() &&
      (aligned - w.start.getTime() >= stepMs / 2 || starts.length === 0)
    ) {
      starts.unshift(w.start.getTime());
    }
    for (const t of starts) {
      if (t > lastStart || t <= notBefore.getTime()) continue;
      const slot = { start: new Date(t), end: new Date(t + durationMin * 60_000) };
      if (!intervalProblem(cal, slot, { buffers })) slots.add(clinicHhmm(slot.start));
    }
  }
  return [...slots].sort();
}

/**
 * Why a day with working hours still has no time: every window lies inside
 * time-off or closed ranges ('TIME_OFF' when any of it is time-off), else null.
 */
export function blockedAllDay(cal: DayCalendar): 'TIME_OFF' | 'CLOSED' | null {
  if (cal.windows.length === 0) return null;
  const used = new Set<'TIME_OFF' | 'CLOSED'>();
  for (const w of cal.windows) {
    let reached = w.start.getTime();
    for (const b of [...cal.blocked].sort((x, y) => x.start.getTime() - y.start.getTime())) {
      if (b.end.getTime() <= reached || b.start.getTime() > reached) continue;
      used.add(b.kind);
      reached = b.end.getTime();
      if (reached >= w.end.getTime()) break;
    }
    if (reached < w.end.getTime()) return null;
  }
  return used.has('TIME_OFF') ? 'TIME_OFF' : 'CLOSED';
}
