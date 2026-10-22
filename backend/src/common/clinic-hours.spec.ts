import { closureIntervals, nextClinicOpening, openingHoursFromEnv } from './clinic-hours';

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

  describe('with clinic closures', () => {
    const day = (d: string) => new Date(d + 'T00:00:00Z');
    const time = (hhmm: string) => new Date('1970-01-01T' + hhmm + ':00Z');

    it('skips a closed day (Friday 2/10 closed → Saturday morning)', () => {
      const closed = closureIntervals([
        { startDate: day('2026-10-02'), endDate: day('2026-10-02') },
      ]);
      // 21:00 Thursday → not Friday 08:00 but Saturday 08:00.
      expect(nextClinicOpening(new Date('2026-10-01T14:00:00Z'), hours, closed)).toEqual(
        new Date('2026-10-03T01:00:00Z'),
      );
    });

    it('treats a closure starting mid-day as closed from that time', () => {
      // Thursday closed from 15:00: at 14:30 it is still open; at 15:30 the next opening is Friday 08:00.
      const closed = closureIntervals([
        { startDate: day('2026-10-01'), endDate: day('2026-10-01'), startTime: time('15:00') },
      ]);
      const open = new Date('2026-10-01T07:30:00Z');
      expect(nextClinicOpening(open, hours, closed)).toEqual(open);
      expect(nextClinicOpening(new Date('2026-10-01T08:30:00Z'), hours, closed)).toEqual(
        new Date('2026-10-02T01:00:00Z'),
      );
    });

    it('skips a run of closed days and a closed Sunday together', () => {
      // Closed Fri 2/10 – Sat 3/10, Sunday closed anyway → Monday 5/10 08:00.
      const closed = closureIntervals([
        { startDate: day('2026-10-02'), endDate: day('2026-10-03') },
      ]);
      expect(nextClinicOpening(new Date('2026-10-01T14:00:00Z'), hours, closed)).toEqual(
        new Date('2026-10-05T01:00:00Z'),
      );
    });
  });
});
