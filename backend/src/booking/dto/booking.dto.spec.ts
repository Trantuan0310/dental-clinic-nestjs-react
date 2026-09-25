import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePublicBookingRequestDto } from './booking.dto';

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
});
