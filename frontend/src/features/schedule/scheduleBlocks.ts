import { clinic } from '@/config/clinic';
import { i18n } from '@/locales';
import type { TimeBlock } from '@/types/schedule';

const WEEKDAY_KEYS = [
  'uiScheduling.weekday0',
  'uiScheduling.weekday1',
  'uiScheduling.weekday2',
  'uiScheduling.weekday3',
  'uiScheduling.weekday4',
  'uiScheduling.weekday5',
  'uiScheduling.weekday6',
];

/** Weekday name in the UI language (0 = Sunday), read when called. */
export const dayLabel = (dayOfWeek: number) => i18n.t(WEEKDAY_KEYS[dayOfWeek]);

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Opening blocks of the clinic on a weekday (0 = Chủ nhật), from config/clinic.ts. */
export function openingBlocks(dayOfWeek: number): TimeBlock[] {
  return clinic.openingHours.byDay[dayOfWeek] ?? [];
}

/** Default blocks for a new schedule: the clinic's weekday opening hours. */
export function defaultBlocks(): TimeBlock[] {
  const blocks = openingBlocks(1);
  return blocks.length ? blocks.map((b) => ({ ...b })) : [{ startTime: '08:00', endTime: '17:00' }];
}

/** Same rules as the backend: HH:mm on a 5-minute grid, end after start, no overlap. */
export function blockError(blocks: TimeBlock[]): string | null {
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const [i, b] of sorted.entries()) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.endTime)) {
      return i18n.t('uiScheduling.scheduleBlockTimeIncomplete');
    }
    if ((toMinutes(b.startTime) % 5 !== 0) || (toMinutes(b.endTime) % 5 !== 0 && b.endTime !== '23:59')) {
      return i18n.t('uiScheduling.scheduleBlockMinuteStep');
    }
    if (b.endTime <= b.startTime) {
      return i18n.t('uiScheduling.scheduleBlockEndBeforeStart', { start: b.startTime, end: b.endTime });
    }
    const prev = sorted[i - 1];
    if (prev && b.startTime < prev.endTime) {
      return i18n.t('uiScheduling.scheduleBlocksOverlap', {
        firstStart: prev.startTime,
        firstEnd: prev.endTime,
        secondStart: b.startTime,
        secondEnd: b.endTime,
      });
    }
  }
  return null;
}

/**
 * Non-blocking warnings: a day the clinic is closed (e.g. Chủ nhật) or a block
 * outside the clinic's opening hours. A dentist may still work then.
 */
export function openingHoursWarnings(days: number[], blocks: TimeBlock[]): string[] {
  const warnings: string[] = [];
  for (const day of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
    const open = openingBlocks(day);
    if (open.length === 0) {
      warnings.push(i18n.t('uiScheduling.scheduleDayClinicClosed', { day: dayLabel(day) }));
      continue;
    }
    const outside = blocks.filter(
      (b) => !open.some((o) => o.startTime <= b.startTime && b.endTime <= o.endTime),
    );
    if (outside.length) {
      warnings.push(
        i18n.t('uiScheduling.scheduleDayOutsideHours', {
          day: dayLabel(day),
          blocks: outside.map((b) => `${b.startTime}–${b.endTime}`).join(', '),
          hours: open.map((o) => `${o.startTime}–${o.endTime}`).join(', '),
        }),
      );
    }
  }
  return warnings;
}
