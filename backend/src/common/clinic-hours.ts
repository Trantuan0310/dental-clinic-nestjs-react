import { CLINIC_UTC_OFFSET_MS } from './date-range.util';

/**
 * Opening hours for clinic-setup's default working schedule and for online
 * booking's notice period and holds, read from the
 * same CLINIC_HOURS / CLINIC_SUNDAY_HOURS values the web app shows (see
 * frontend/src/config/clinic.ts), so the dentists' schedule and the hours on
 * the landing page come from one place.
 */

export const DEFAULT_WEEKDAY_HOURS = '08:00 – 12:00 · 13:30 – 19:00';

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'FULL_DAY';

export interface HourBlock {
  /** Minutes after midnight, clinic wall-clock time. */
  start: number;
  end: number;
  shiftType: ShiftType;
}

/** Same label rule as AppointmentsService.shiftTypeOf. */
function shiftTypeOf(start: number, end: number): ShiftType {
  if (end <= 13 * 60) return 'MORNING';
  if (start >= 18 * 60) return 'NIGHT';
  if (start >= 12 * 60) return 'AFTERNOON';
  return 'FULL_DAY';
}

/**
 * "08:00 – 12:00 · 13:30 – 19:00" → two blocks. Text without any "HH:MM – HH:MM"
 * pair (e.g. "Nghỉ") means closed. Same pattern as the frontend's
 * parseHourBlocks; throws on a pair that is not a valid, ordered,
 * non-overlapping time range.
 */
export function parseHourBlocks(text: string): HourBlock[] {
  const blocks: HourBlock[] = [];
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)) {
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) {
      throw new Error(`Giờ không hợp lệ: "${m[0]}"`);
    }
    const start = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    if (end <= start) throw new Error(`Giờ kết thúc phải sau giờ bắt đầu: "${m[0]}"`);
    const previous = blocks[blocks.length - 1];
    if (previous && start < previous.end) {
      throw new Error(`Các khung giờ phải theo thứ tự và không chồng nhau: "${text}"`);
    }
    blocks.push({ start, end, shiftType: shiftTypeOf(start, end) });
  }
  return blocks;
}

/**
 * dayOfWeek (0 = Sunday) → blocks. CLINIC_HOURS covers Monday–Saturday and
 * defaults to DEFAULT_WEEKDAY_HOURS when unset; CLINIC_SUNDAY_HOURS defaults to
 * closed. A CLINIC_HOURS value with no time range is a configuration mistake,
 * not "closed all week", so it throws.
 */
export function openingHoursFromEnv(env: NodeJS.ProcessEnv = process.env): HourBlock[][] {
  const weekdayText = env.CLINIC_HOURS?.trim() || DEFAULT_WEEKDAY_HOURS;
  const weekday = parseHourBlocks(weekdayText);
  if (weekday.length === 0) {
    throw new Error(`CLINIC_HOURS="${weekdayText}" không có khung giờ nào dạng "08:00 – 12:00"`);
  }
  const sunday = parseHourBlocks(env.CLINIC_SUNDAY_HOURS?.trim() || '');
  return [0, 1, 2, 3, 4, 5, 6].map(day => (day === 0 ? sunday : weekday));
}

export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "T2–T7 08:00–12:00, 13:30–19:00; CN nghỉ" for the script's log line. */
export function describeOpeningHours(byDay: HourBlock[][]): string {
  const ranges = (blocks: HourBlock[]) =>
    blocks.map(b => `${formatMinutes(b.start)}–${formatMinutes(b.end)}`).join(', ');
  const sunday = byDay[0].length ? `CN ${ranges(byDay[0])}` : 'CN nghỉ';
  return `T2–T7 ${ranges(byDay[1])}; ${sunday}`;
}

/** The clinic's opening hours, or null when CLINIC_HOURS can't be read (callers then use the plain clock). */
export function clinicOpeningHours(env: NodeJS.ProcessEnv = process.env): HourBlock[][] | null {
  try {
    return openingHoursFromEnv(env);
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60_000;

/** A stretch the whole clinic is closed, as instants (ms since epoch, UTC). */
export interface ClosedInterval {
  start: number;
  end: number;
}

/**
 * Clinic closures (clinic_closures rows: whole days, the first one possibly
 * from `startTime`) as instants: closed from the start day (at `startTime`,
 * else midnight, clinic time) up to the end of the end day.
 */
export function closureIntervals(
  rows: Array<{ startDate: Date; endDate: Date; startTime?: Date | null }>,
): ClosedInterval[] {
  return rows.map(r => {
    const firstMidnight = r.startDate.getTime() - CLINIC_UTC_OFFSET_MS;
    const fromMinutes = r.startTime
      ? r.startTime.getUTCHours() * 60 + r.startTime.getUTCMinutes()
      : 0;
    return {
      start: firstMidnight + fromMinutes * 60_000,
      end: r.endDate.getTime() - CLINIC_UTC_OFFSET_MS + DAY_MS,
    };
  });
}

/**
 * `at` itself while the clinic is open, otherwise the start of its next
 * opening block (looking two weeks ahead): when the front desk can first act
 * on something that came in at `at`. Time inside a clinic closure (Tết, a
 * holiday) is not open.
 */
export function nextClinicOpening(
  at: Date,
  byDay: HourBlock[][] | null = clinicOpeningHours(),
  closed: ClosedInterval[] = [],
): Date {
  if (!byDay) return at;
  const local = at.getTime() + CLINIC_UTC_OFFSET_MS;
  const firstDay = Math.floor(local / DAY_MS) * DAY_MS;
  // Closures in clinic-local ms, like the blocks below.
  const shut = closed.map(c => ({
    start: c.start + CLINIC_UTC_OFFSET_MS,
    end: c.end + CLINIC_UTC_OFFSET_MS,
  }));
  for (let d = 0; d <= 14; d++) {
    const day = firstDay + d * DAY_MS;
    for (const b of byDay[new Date(day).getUTCDay()] ?? []) {
      const blockEnd = day + b.end * 60_000;
      let from = Math.max(day + b.start * 60_000, local);
      // Step past every closure that covers the candidate instant.
      for (let moved = true; moved && from < blockEnd;) {
        moved = false;
        for (const c of shut) {
          if (c.start <= from && from < c.end) {
            from = c.end;
            moved = true;
          }
        }
      }
      if (from < blockEnd) return new Date(from - CLINIC_UTC_OFFSET_MS);
    }
  }
  return at;
}
