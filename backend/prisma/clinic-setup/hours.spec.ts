import { openingHoursFromEnv, parseHourBlocks } from './hours';

/**
 * These rules are the reference for the frontend's own parser in
 * frontend/src/config/clinic.ts, which reads the same CLINIC_HOURS value to
 * show the opening hours and to seed the working-schedule form. That one
 * used to accept ranges this parser rejects, so a typo in CLINIC_HOURS
 * became opening-hours data on the web app while clinic-setup refused it.
 */
describe('parseHourBlocks', () => {
  it('reads the blocks of a well-formed value', () => {
    expect(parseHourBlocks('08:00 – 12:00 · 13:30 – 19:00')).toEqual([
      { start: 480, end: 720, shiftType: 'MORNING' },
      { start: 810, end: 1140, shiftType: 'AFTERNOON' },
    ]);
  });

  it('accepts a single-digit hour and an ASCII hyphen', () => {
    expect(parseHourBlocks('8:00 - 12:00')).toHaveLength(1);
  });

  it('reads text with no time range as closed', () => {
    expect(parseHourBlocks('Nghỉ')).toEqual([]);
    expect(parseHourBlocks('')).toEqual([]);
  });

  it.each([
    ['an hour past 23', '25:00 – 30:00'],
    ['a minute past 59', '08:70 – 12:00'],
    ['an end before the start', '19:00 – 08:00'],
    ['an empty range', '08:00 – 08:00'],
    ['overlapping blocks', '08:00 – 12:00 · 11:00 – 19:00'],
    ['blocks out of order', '13:30 – 19:00 · 08:00 – 12:00'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseHourBlocks(value)).toThrow();
  });
});

describe('openingHoursFromEnv', () => {
  it('applies CLINIC_HOURS to Monday–Saturday and closes Sunday by default', () => {
    const byDay = openingHoursFromEnv({ CLINIC_HOURS: '09:00 – 17:00' } as NodeJS.ProcessEnv);
    expect(byDay[0]).toEqual([]);
    for (const day of [1, 2, 3, 4, 5, 6]) {
      expect(byDay[day]).toEqual([{ start: 540, end: 1020, shiftType: 'FULL_DAY' }]);
    }
  });

  it('opens Sunday when CLINIC_SUNDAY_HOURS has a range', () => {
    const byDay = openingHoursFromEnv({
      CLINIC_SUNDAY_HOURS: '08:00 – 11:00',
    } as NodeJS.ProcessEnv);
    expect(byDay[0]).toEqual([{ start: 480, end: 660, shiftType: 'MORNING' }]);
  });

  it('falls back to the default weekday hours when CLINIC_HOURS is unset', () => {
    expect(openingHoursFromEnv({} as NodeJS.ProcessEnv)[1]).toHaveLength(2);
  });

  // "Closed all week" is never what someone means to configure, so a value
  // the regex finds no range in is a mistake worth stopping the setup for.
  it('refuses a CLINIC_HOURS value with no time range at all', () => {
    expect(() => openingHoursFromEnv({ CLINIC_HOURS: 'Nghỉ' } as NodeJS.ProcessEnv)).toThrow(
      /không có khung giờ nào/,
    );
  });
});
