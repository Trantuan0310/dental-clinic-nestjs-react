import {
  clinicDateOnly,
  startOfClinicDay,
  endOfClinicDay,
  endOfDayInclusive,
} from './date-range.util';

describe('Clinic calendar boundaries', () => {
  it('keeps midnight transactions in the correct Vietnam calendar day', () => {
    const midnightVisit = new Date('2026-09-15T17:30:00Z');
    expect(clinicDateOnly(midnightVisit)).toBe('2026-09-16');
    expect(startOfClinicDay('2026-09-16').toISOString()).toBe('2026-09-15T17:00:00.000Z');
    expect(endOfClinicDay('2026-09-16').toISOString()).toBe('2026-09-16T16:59:59.999Z');
    expect(midnightVisit >= startOfClinicDay('2026-09-16')).toBe(true);
    expect(midnightVisit <= endOfClinicDay('2026-09-15')).toBe(false);
  });

  it('preserves explicit instants and UTC DATE-column semantics', () => {
    const instant = '2026-09-15T17:00:00.000Z';
    expect(startOfClinicDay(instant).toISOString()).toBe(instant);
    expect(endOfClinicDay(instant).toISOString()).toBe(instant);
    expect(endOfDayInclusive('2026-09-16').toISOString()).toBe('2026-09-16T23:59:59.999Z');
  });
});
