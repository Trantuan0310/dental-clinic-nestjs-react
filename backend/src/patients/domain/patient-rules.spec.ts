import { isMinor, isValidDob } from './patient-rules';

const dob = (day: string) => new Date(`${day}T00:00:00Z`);

describe('age rules read the date at the clinic (UTC+7)', () => {
  it('turns 12 on the birthday morning at the clinic, even before 07:00 (still the day before in UTC)', () => {
    const birthdayMorning = new Date('2026-10-22T18:30:00Z'); // 01:30 on 23/10 at the clinic
    expect(isMinor(dob('2014-10-23'), birthdayMorning)).toBe(false);
    expect(isMinor(dob('2014-10-24'), birthdayMorning)).toBe(true);
  });

  it('accepts a birth date of today at the clinic, not tomorrow', () => {
    const early = new Date('2026-10-22T18:30:00Z'); // 23/10 at the clinic
    expect(isValidDob(dob('2026-10-23'), early)).toBe(true);
    expect(isValidDob(dob('2026-10-24'), early)).toBe(false);
    expect(isValidDob(dob('1870-01-01'), early)).toBe(false);
  });
});
