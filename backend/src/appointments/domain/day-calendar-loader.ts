import { Prisma, PrismaClient } from '@prisma/client';
import { clinicDateOnly, startOfClinicDay } from '../../common/date-range.util';
import {
  DayCalendar,
  DayInputs,
  Interval,
  SlotProblem,
  blockedAllDay,
  buildDayCalendar,
  intervalProblem,
} from './day-calendar';

/**
 * Batched loading of DayCalendars (round 4): many dentist × date pairs in a
 * fixed number of queries, for the jobs and reports that look at many
 * bookings at once (schedule-impact list, auto no-show, reminders, payroll).
 * The rules are the same as AvailabilityService.loadDay — both build the
 * day with buildDayCalendar.
 *
 * Shared helpers for other modules:
 *   - loadDayCalendars(db, keys)            → Map<dayKey, DayCalendar>
 *   - dentistDayAbsences(db, id, from, to)  → "is day X of dentist Y closed /
 *     on time-off / clinic closed?" for every date of a range (payroll)
 *   - calendarProblems(db, visits)          → Map<visitId, SlotProblem | null>
 *     ignoring other bookings (reminders, auto no-show)
 */

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60_000;

export interface DayKey {
  dentistId: string;
  /** Clinic date "YYYY-MM-DD". */
  date: string;
}

export const dayKey = (dentistId: string, date: string) => `${dentistId}|${date}`;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const viDate = (d: Date) => isoDate(d).split('-').reverse().join('/');

/**
 * A dentist leaving on a planned date (employees.terminationDate) takes no
 * visit from that date on: the day reads as closed all day.
 */
export function terminationOverride(terminationDate: Date | null | undefined, date: string) {
  if (!terminationDate || date < isoDate(terminationDate)) return [];
  return [
    {
      kind: 'CLOSED' as const,
      startTime: null,
      endTime: null,
      reason: `Bác sĩ nghỉ việc từ ngày ${viDate(terminationDate)}`,
    },
  ];
}

/**
 * Clinic closures covering `date`; a mid-day closure (migration 043) keeps
 * its start time on its first day only and closes all of the following days.
 */
export function closuresOnDay(
  rows: Array<{ startDate: Date; reason: string; startTime?: Date | null }>,
  date: string,
): NonNullable<DayInputs['clinicClosures']> {
  return rows.map(r => ({
    reason: r.reason,
    startTime: r.startTime && isoDate(r.startDate) === date ? r.startTime : null,
  }));
}

/** Calendars of many (dentist, date) pairs; bookings only when asked for. */
export async function loadDayCalendars(
  db: Db,
  keys: DayKey[],
  { withBookings = false }: { withBookings?: boolean } = {},
): Promise<Map<string, DayCalendar>> {
  const out = new Map<string, DayCalendar>();
  if (keys.length === 0) return out;
  const dentistIds = [...new Set(keys.map(k => k.dentistId))];
  const dates = [...new Set(keys.map(k => k.date))].sort();
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const rangeStart = startOfClinicDay(dates[0]);
  const rangeEnd = new Date(startOfClinicDay(dates[dates.length - 1]).getTime() + DAY_MS);
  const dateValues = dates.map(d => new Date(d));
  const [schedules, shifts, overrides, timeOffs, bookings, closures, employees] = await Promise.all(
    [
      db.workingSchedule.findMany({
        where: {
          dentistId: { in: dentistIds },
          validFrom: { lte: last },
          OR: [{ validTo: null }, { validTo: { gte: first } }],
          deletedAt: null,
        },
        orderBy: { startTime: 'asc' },
        select: {
          dentistId: true,
          dayOfWeek: true,
          validFrom: true,
          validTo: true,
          startTime: true,
          endTime: true,
          slotDurationMin: true,
        },
      }),
      db.shiftRegistration.findMany({
        where: {
          dentistId: { in: dentistIds },
          date: { in: dateValues },
          status: 'APPROVED',
          deletedAt: null,
        },
        select: { dentistId: true, date: true, startTime: true, endTime: true },
      }),
      db.scheduleOverride.findMany({
        where: { dentistId: { in: dentistIds }, date: { in: dateValues }, deletedAt: null },
        select: {
          dentistId: true,
          date: true,
          kind: true,
          startTime: true,
          endTime: true,
          reason: true,
        },
      }),
      db.timeOff.findMany({
        where: {
          dentistId: { in: dentistIds },
          status: 'APPROVED',
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
          deletedAt: null,
        },
        select: { dentistId: true, startAt: true, endAt: true },
      }),
      withBookings
        ? db.appointment.findMany({
            where: {
              dentistId: { in: dentistIds },
              status: { notIn: ['CANCELLED', 'NO_SHOW', 'LEFT'] },
              startAt: { lt: rangeEnd },
              endAt: { gt: rangeStart },
              deletedAt: null,
            },
            select: {
              id: true,
              dentistId: true,
              startAt: true,
              endAt: true,
              bufferBeforeMin: true,
              bufferAfterMin: true,
            },
          })
        : Promise.resolve([]),
      db.clinicClosure.findMany({
        where: { startDate: { lte: last }, endDate: { gte: first }, deletedAt: null },
        select: { startDate: true, endDate: true, startTime: true, reason: true },
      }),
      db.employee.findMany({
        where: { userId: { in: dentistIds }, deletedAt: null, terminationDate: { not: null } },
        select: { userId: true, terminationDate: true },
      }),
    ],
  );
  const leaving = new Map((employees ?? []).map(e => [e.userId, e.terminationDate]));
  for (const { dentistId, date } of keys) {
    const k = dayKey(dentistId, date);
    if (out.has(k)) continue;
    const day = new Date(date);
    const dayStart = startOfClinicDay(date);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    out.set(
      k,
      buildDayCalendar({
        date,
        schedules: (schedules ?? []).filter(
          s =>
            s.dentistId === dentistId &&
            s.dayOfWeek === day.getUTCDay() &&
            s.validFrom <= day &&
            (!s.validTo || s.validTo >= day),
        ),
        shifts: (shifts ?? []).filter(s => s.dentistId === dentistId && isoDate(s.date) === date),
        overrides: [
          ...(overrides ?? []).filter(o => o.dentistId === dentistId && isoDate(o.date) === date),
          ...terminationOverride(leaving.get(dentistId), date),
        ],
        timeOffs: (timeOffs ?? []).filter(
          t => t.dentistId === dentistId && t.startAt < dayEnd && t.endAt > dayStart,
        ),
        bookings: (bookings ?? []).filter(
          b => b.dentistId === dentistId && b.startAt < dayEnd && b.endAt > dayStart,
        ),
        clinicClosures: closuresOnDay(
          (closures ?? []).filter(c => c.startDate <= day && c.endDate >= day),
          date,
        ),
      }),
    );
  }
  return out;
}

/** What keeps a dentist from working on a day (payroll, reminders, reports). */
export interface DayAbsence {
  date: string;
  /** Working windows the schedule gives that day (before blocks). */
  windows: Interval[];
  /** Approved time-off and closed ranges inside the day. */
  blocked: DayCalendar['blocked'];
  /** The whole clinic is closed all day (Tết, holiday). */
  clinicClosed: boolean;
  /** Closed all day: clinic closure, CLOSED override, or the dentist has left. */
  closedAllDay: boolean;
  closedReason: string | null;
  /**
   * No working time is left at all that day, and why:
   * CLINIC_CLOSED, CLOSED (override / left the clinic) or TIME_OFF.
   * null when some working time remains (or the day had none to begin with).
   */
  absentAllDay: 'CLINIC_CLOSED' | 'CLOSED' | 'TIME_OFF' | null;
}

export function dayAbsence(cal: DayCalendar): DayAbsence {
  return {
    date: cal.date,
    windows: cal.windows,
    blocked: cal.blocked,
    clinicClosed: cal.clinicClosed,
    closedAllDay: cal.closedAllDay,
    closedReason: cal.closedReason,
    absentAllDay: cal.clinicClosed
      ? 'CLINIC_CLOSED'
      : cal.closedAllDay
        ? 'CLOSED'
        : blockedAllDay(cal),
  };
}

/**
 * "Is day X of dentist Y closed / on time-off / is the clinic closed?" for
 * every clinic date of [from, to] (inclusive, "YYYY-MM-DD"). Meant for
 * payroll (approved time-off and closed days are not paid by the hour).
 */
export async function dentistDayAbsences(
  db: Db,
  dentistId: string,
  from: string,
  to: string,
): Promise<Map<string, DayAbsence>> {
  const keys: DayKey[] = [];
  for (let t = new Date(from).getTime(); t <= new Date(to).getTime(); t += DAY_MS) {
    keys.push({ dentistId, date: isoDate(new Date(t)) });
  }
  const cals = await loadDayCalendars(db, keys);
  return new Map(keys.map(k => [k.date, dayAbsence(cals.get(dayKey(k.dentistId, k.date))!)]));
}

/**
 * Why each visit's time is no longer on the dentist's calendar (closed day,
 * clinic closure, time-off, hours withdrawn), ignoring other bookings — the
 * check of the schedule-impact list, in one batch.
 */
export async function calendarProblems(
  db: Db,
  visits: Array<{ id: string; dentistId: string; startAt: Date; endAt: Date }>,
): Promise<Map<string, SlotProblem | null>> {
  const cals = await loadDayCalendars(
    db,
    visits.map(v => ({ dentistId: v.dentistId, date: clinicDateOnly(v.startAt) })),
  );
  return new Map(
    visits.map(v => [
      v.id,
      intervalProblem(
        cals.get(dayKey(v.dentistId, clinicDateOnly(v.startAt)))!,
        { start: v.startAt, end: v.endAt },
        { ignoreBookings: true },
      ),
    ]),
  );
}

/**
 * A1-17: why a one-off shift (shift registration) cannot be worked on that
 * clinic date — the dentist is gone, the clinic or the dentist's day is
 * closed, or approved time-off / a closed range overlaps it — or null.
 * Shared by both shift-registration services (create and approve).
 */
export async function shiftDayProblem(
  db: Db,
  dentistId: string,
  date: Date,
  startTime: string,
  endTime: string,
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: dentistId },
    select: {
      status: true,
      deactivatedAt: true,
      deletedAt: true,
      userRoles: { select: { role: { select: { code: true } } } },
    },
  });
  if (
    !user ||
    user.status === 'DEACTIVATED' ||
    user.deactivatedAt ||
    user.deletedAt ||
    !user.userRoles.some(ur => ur.role.code === 'dentist')
  ) {
    return 'Bác sĩ không tồn tại hoặc không còn hoạt động';
  }
  const d = isoDate(date);
  const cal = (await loadDayCalendars(db, [{ dentistId, date: d }])).get(dayKey(dentistId, d))!;
  if (cal.closedAllDay) {
    return `Ngày ${viDate(date)} không làm việc: ${cal.closedReason ?? 'lịch của bác sĩ đóng cả ngày'}`;
  }
  const start = new Date(`${d}T${startTime}:00+07:00`);
  const end = new Date(`${d}T${endTime}:00+07:00`);
  const block = cal.blocked.find(b => b.start < end && start < b.end);
  if (!block) return null;
  if (block.kind === 'TIME_OFF') {
    return `Bác sĩ có nghỉ phép đã duyệt trùng ca ${startTime}-${endTime} ngày ${viDate(date)}`;
  }
  return `${block.reason ?? 'Lịch của bác sĩ đóng'} — trùng ca ${startTime}-${endTime} ngày ${viDate(date)}`;
}
