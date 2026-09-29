import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePublicBookingRequestDto, UpdatePublicBookingDetailsDto } from './booking.dto';

const base = {
  fullName: 'Nguyen An',
  dob: '1990-01-01',
  gender: 'FEMALE',
  phone: '0901234567',
  serviceId: '01900000-0000-7000-8000-000000000001',
  dentistId: '01900000-0000-7000-8000-000000000002',
  startAt: '2099-01-01T03:00:00.000Z',
  consent: true,
};
const errorsFor = (extra: Record<string, unknown>) =>
  validateSync(plainToInstance(CreatePublicBookingRequestDto, { ...base, ...extra })).map(
    e => e.property,
  );

describe('CreatePublicBookingRequestDto', () => {
  it('accepts the optional fields left empty by the public form', () => {
    // Regression: the form sends '' for an empty email, which failed @IsEmail
    // and blocked every patient without an email from booking.
    expect(
      errorsFor({ email: '', contactPersonName: '', contactPersonPhone: '', reason: '  ' }),
    ).toEqual([]);
  });

  it('still rejects an email that is filled in but malformed', () => {
    expect(errorsFor({ email: 'not-an-email' })).toEqual(['email']);
  });

  it('trims the name before checking its length', () => {
    expect(errorsFor({ fullName: '     ' })).toEqual(['fullName']);
    expect(errorsFor({ fullName: ' a ' })).toEqual(['fullName']);
    const dto = plainToInstance(CreatePublicBookingRequestDto, { ...base, fullName: '  An  ' });
    expect(dto.fullName).toBe('An');
  });

  it('refuses NUL characters in free text', () => {
    expect(errorsFor({ fullName: 'Nguyen\u0000An' })).toEqual(['fullName']);
    expect(errorsFor({ reason: 'x\u0000' })).toEqual(['reason']);
    expect(errorsFor({ contactPersonName: 'Me\u0000' })).toEqual(['contactPersonName']);
  });

  it('accepts only a real calendar date of birth as YYYY-MM-DD', () => {
    expect(errorsFor({ dob: '2026-02-30' })).toEqual(['dob']);
    expect(errorsFor({ dob: '1990-1-1' })).toEqual(['dob']);
    expect(errorsFor({ dob: '2024-02-29' })).toEqual([]);
  });
});

describe('UpdatePublicBookingDetailsDto', () => {
  const errors = (value: Record<string, unknown>) =>
    validateSync(plainToInstance(UpdatePublicBookingDetailsDto, value)).map(e => e.property);

  it('treats every field as optional (left out = unchanged)', () => {
    expect(errors({})).toEqual([]);
    expect(errors({ fullName: '   ', gender: '', dob: '' })).toEqual([]);
  });

  it('still validates the fields sent', () => {
    expect(errors({ dob: '2026-02-30', gender: 'X', email: 'bad' }).sort()).toEqual([
      'dob',
      'email',
      'gender',
    ]);
  });
});
