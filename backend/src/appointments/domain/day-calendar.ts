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
  /** Appointments holding a slot (not CANCELLED/NO_SHOW, not deleted). */
  bookings: Array<{ id: string; startAt: Date; endAt: Date }>;
}

export interface DayCalendar {
  date: string;
  /** Periods the dentist works; a booking must fit inside one of them. */
  windows: Interval[];
  /** Time-off and closed ranges inside the day. */
  blocked: Array<Interval & { kind: 'TIME_OFF' | 'CLOSED' }>;
  bookings: Array<Interval & { id: string }>;
  closedAllDay: boolean;
  closedReason: string | null;
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

export function buildDayCalendar(i: DayInputs): DayCalendar {
  const closedAll = i.overrides.find(o => o.kind === 'CLOSED' && !o.startTime);
  const changed = i.overrides.find(o => o.kind === 'CHANGED_HOURS' && o.startTime && o.endTime);

  // BR-SCH-004: changed hours replace the weekly schedule; approved shifts
  // still add hours (ADR-0009 D3). BR-SCH-003: a closed day has none.
  const weekly = changed
    ? [{ start: timeOfDay(changed.startTime!), end: timeOfDay(changed.endTime!) }]
    : i.schedules.map(s => ({ start: timeOfDay(s.startTime), end: timeOfDay(s.endTime) }));
  const windows = closedAll
    ? []
    : [...weekly, ...i.shifts.map(s => ({ start: s.startTime, end: s.endTime }))]
        .map(w => ({ start: atClinicTime(i.date, w.start), end: atClinicTime(i.date, w.end) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

  const blocked = [
    ...i.overrides
      .filter(o => o.kind === 'CLOSED' && o.startTime && o.endTime)
      .map(o => ({
        start: atClinicTime(i.date, timeOfDay(o.startTime!)),
        end: atClinicTime(i.date, timeOfDay(o.endTime!)),
        kind: 'CLOSED' as const,
      })),
    ...i.timeOffs.map(t => ({ start: t.startAt, end: t.endAt, kind: 'TIME_OFF' as const })),
  ];

  return {
    date: i.date,
    windows,
    blocked,
    bookings: i.bookings.map(b => ({ id: b.id, start: b.startAt, end: b.endAt })),
    closedAllDay: Boolean(closedAll),
    closedReason: closedAll?.reason ?? null,
    changedHours: Boolean(changed),
    defaultSlotMin: i.schedules[0]?.slotDurationMin ?? 30,
  };
}

/**
 * Why [start, end) cannot be booked, or null. Checked in this order so the
 * message names the most basic reason: closed day → outside working hours →
 * closed range → time-off → another booking.
 */
export function intervalProblem(
  cal: DayCalendar,
  slot: Interval,
  opts: { excludeBookingId?: string; ignoreBookings?: boolean } = {},
): SlotProblem | null {
  if (cal.closedAllDay) {
    return { kind: 'CLOSED', message: `Dentist's calendar is closed on ${cal.date}` };
  }
  // BR-APPT-003/027: the whole visit fits in one working window (a gap such
  // as lunch between two windows is not bookable).
  if (!cal.windows.some(w => w.start <= slot.start && slot.end <= w.end)) {
    const hours = cal.windows.map(w => `${clinicHhmm(w.start)}-${clinicHhmm(w.end)}`).join(', ');
    return {
      kind: 'OUTSIDE_WORKING_HOURS',
      message: hours
        ? `${clinicHhmm(slot.start)}-${clinicHhmm(slot.end)} is outside working hours ${hours}${cal.changedHours ? ' (changed hours)' : ''} on ${cal.date}`
        : 'Dentist has no working schedule for this day',
    };
  }
  const block = cal.blocked.find(b => overlaps(b, slot));
  if (block) {
    return block.kind === 'CLOSED'
      ? {
          kind: 'CLOSED',
          message: `Dentist's calendar is closed ${clinicHhmm(block.start)}-${clinicHhmm(block.end)} on ${cal.date}`,
        }
      : {
          kind: 'TIME_OFF',
          message: `Dentist is on time-off from ${block.start.toISOString()} to ${block.end.toISOString()}`,
        };
  }
  if (!opts.ignoreBookings) {
    const clash = cal.bookings.find(
      b =>
        (opts.excludeBookingId === undefined || b.id !== opts.excludeBookingId) &&
        overlaps(b, slot),
    );
    if (clash) return { kind: 'SLOT_CONFLICT', message: 'This time slot is already booked' };
  }
  return null;
}

/**
 * Bookable start times ("HH:mm") for a visit of `durationMin`, stepping
 * `stepMin` from each window's start, not before `notBefore`.
 */
export function freeSlots(
  cal: DayCalendar,
  durationMin: number,
  stepMin: number,
  notBefore: Date,
): string[] {
  const slots = new Set<string>();
  for (const w of cal.windows) {
    for (
      let t = w.start.getTime();
      t + durationMin * 60_000 <= w.end.getTime();
      t += stepMin * 60_000
    ) {
      if (t <= notBefore.getTime()) continue;
      const slot = { start: new Date(t), end: new Date(t + durationMin * 60_000) };
      if (!intervalProblem(cal, slot)) slots.add(clinicHhmm(slot.start));
    }
  }
  return [...slots].sort();
}
