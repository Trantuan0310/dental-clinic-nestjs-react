import { nextClinicOpening, openingHoursFromEnv } from './clinic-hours';

describe('nextClinicOpening', () => {
  // Mon–Sat 08:00–12:00 · 13:30–19:00, Sunday closed. 2026-10-01 is a Thursday.
  const hours = openingHoursFromEnv({} as NodeJS.ProcessEnv);

  it('is the moment itself while the clinic is open', () => {
    const at = new Date('2026-10-01T03:00:00Z'); // 10:00 at the clinic
    expect(nextClinicOpening(at, hours)).toEqual(at);
  });

  it('is the next morning for a moment after closing', () => {
    // 21:00 Thursday → 08:00 Friday.
    expect(nextClinicOpening(new Date('2026-10-01T14:00:00Z'), hours)).toEqual(
      new Date('2026-10-02T01:00:00Z'),
    );
  });

  it('is the afternoon block during the lunch break, and skips a closed Sunday', () => {
    expect(nextClinicOpening(new Date('2026-10-01T05:30:00Z'), hours)).toEqual(
      new Date('2026-10-01T06:30:00Z'),
    );
    // 20:00 Saturday 3 Oct → 08:00 Monday 5 Oct.
    expect(nextClinicOpening(new Date('2026-10-03T13:00:00Z'), hours)).toEqual(
      new Date('2026-10-05T01:00:00Z'),
    );
  });

  it('falls back to the clock without usable hours', () => {
    const at = new Date('2026-10-01T14:00:00Z');
    expect(nextClinicOpening(at, null)).toEqual(at);
  });
});
