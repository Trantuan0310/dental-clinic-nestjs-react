import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AcceptBookingProposalDto,
  PublicBookingNoteDto,
  CreatePublicBookingRequestDto,
  UpdatePublicBookingDetailsDto,
} from './booking.dto';

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

describe('AcceptBookingProposalDto', () => {
  const errors = (value: Record<string, unknown>) =>
    validateSync(plainToInstance(AcceptBookingProposalDto, value)).map(e => e.property);

  it('needs an absolute instant (Z or an offset)', () => {
    expect(errors({ proposedStartAt: '2026-10-02T03:00:00.000Z' })).toEqual([]);
    expect(errors({ proposedStartAt: '2026-10-02T10:00:00+07:00' })).toEqual([]);
    expect(errors({ proposedStartAt: '2026-10-02T10:00:00' })).toEqual(['proposedStartAt']);
    expect(errors({ proposedStartAt: '2026-10-02' })).toEqual(['proposedStartAt']);
    expect(errors({})).toEqual([]);
  });
});

describe('public DTO messages', () => {
  const messages = (value: Record<string, unknown>) =>
    validateSync(plainToInstance(CreatePublicBookingRequestDto, { ...base, ...value })).flatMap(e =>
      Object.values(e.constraints ?? {}),
    );

  it('says what is wrong in Vietnamese, never "phone must be longer than…"', () => {
    const all = [
      ...messages({ phone: '123' }),
      ...messages({ fullName: 'A' }),
      ...messages({ email: 'bad' }),
      ...messages({ gender: 'X' }),
      ...messages({ serviceId: 'x' }),
      ...messages({ consent: 'yes' }),
    ];
    expect(all).toEqual([
      'Số điện thoại không hợp lệ',
      'Họ và tên cần ít nhất 2 ký tự',
      'Email không hợp lệ',
      'Giới tính không hợp lệ',
      'Vui lòng chọn dịch vụ',
      'Cần đồng ý để phòng khám sử dụng thông tin nhằm xử lý yêu cầu đặt lịch',
    ]);
    expect(all.join(' ')).not.toMatch(/must|should|longer|shorter/);
  });

  it('needs the time zone on the requested start (a bare time would be read as UTC)', () => {
    expect(messages({ startAt: '2026-10-28T09:00:00' })).toEqual([
      'Giờ khám không hợp lệ (thiếu múi giờ). Vui lòng tải lại trang và chọn lại giờ.',
    ]);
    expect(messages({ startAt: '2026-10-28T09:00:00+07:00' })).toEqual([]);
  });

  it('keeps notes short and free of NUL characters', () => {
    const errors = (value: Record<string, unknown>) =>
      validateSync(plainToInstance(PublicBookingNoteDto, value)).flatMap(e =>
        Object.values(e.constraints ?? {}),
      );
    expect(errors({})).toEqual([]);
    expect(errors({ message: 'x'.repeat(1001) })).toEqual(['Lời nhắn tối đa 1000 ký tự']);
    expect(errors({ message: 'a\u0000' })).toEqual(['Lời nhắn chứa ký tự không hợp lệ']);
  });
});
