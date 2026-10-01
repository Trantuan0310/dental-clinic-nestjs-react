import { BookingRequestStatus, Gender } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

// The public form sends '' for a field left empty; an optional field left
// empty must not fail validation (a patient without email could not book).
const BlankToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));
// Trimmed before the length checks, so "   " is not a name.
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
// A NUL byte is refused by Postgres text columns (500) and has no business in a form.
const NoNul = (label: string) =>
  Matches(/^[^\u0000]*$/, { message: label + ' chứa ký tự không hợp lệ' });

// The public pages show these messages as they are: every check on a public
// DTO says what is wrong in Vietnamese, naming the field as the form does.
const Text = (label: string) => IsString({ message: label + ' không hợp lệ' });
const Min = (n: number, label: string) =>
  MinLength(n, { message: label + ' cần ít nhất ' + n + ' ký tự' });
const Max = (n: number, label: string) =>
  MaxLength(n, { message: label + ' tối đa ' + n + ' ký tự' });
const PHONE = 'Số điện thoại';
const PHONE_LENGTH = { message: 'Số điện thoại không hợp lệ' };
const EMAIL = { message: 'Email không hợp lệ' };
const GENDER = { message: 'Giới tính không hợp lệ' };
const GUARDIAN = 'Tên người giám hộ';
const GUARDIAN_PHONE = 'Số điện thoại người giám hộ';
const REASON = 'Lý do khám';

/** "YYYY-MM-DD" naming a real calendar day (2026-02-30 is not one). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const IsCalendarDate = (message = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)') =>
  ValidateBy({
    name: 'isCalendarDate',
    validator: {
      validate: value => isCalendarDate(value),
      defaultMessage: () => message,
    },
  });

export class CreatePublicBookingRequestDto {
  @ApiProperty()
  @Trim()
  @Text('Họ và tên')
  @NoNul('Họ và tên')
  @Min(2, 'Họ và tên')
  @Max(200, 'Họ và tên')
  fullName!: string;
  @ApiProperty({ example: '1990-05-01' }) @IsCalendarDate('Ngày sinh không hợp lệ') dob!: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender, GENDER) gender!: Gender;
  @ApiProperty()
  @Text(PHONE)
  @NoNul(PHONE)
  @MinLength(9, PHONE_LENGTH)
  @MaxLength(20, PHONE_LENGTH)
  phone!: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @NoNul('Email')
  @IsEmail({}, EMAIL)
  email?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(GUARDIAN)
  @NoNul(GUARDIAN)
  @Max(200, GUARDIAN)
  contactPersonName?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(GUARDIAN_PHONE)
  @NoNul(GUARDIAN_PHONE)
  @MaxLength(20, { message: GUARDIAN_PHONE + ' không hợp lệ' })
  contactPersonPhone?: string;
  @ApiProperty() @IsUUID(undefined, { message: 'Vui lòng chọn dịch vụ' }) serviceId!: string;
  @ApiProperty() @IsUUID(undefined, { message: 'Vui lòng chọn bác sĩ' }) dentistId!: string;
  // An absolute instant: a zone-less "2026-10-28T09:00:00" would be read in
  // the server's zone (UTC), 7 hours off the clinic's.
  @ApiProperty({ example: '2026-10-28T02:00:00.000Z' })
  @IsDateString({}, { message: 'Vui lòng chọn ngày và giờ khám hợp lệ' })
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'Giờ khám không hợp lệ (thiếu múi giờ). Vui lòng tải lại trang và chọn lại giờ.',
  })
  startAt!: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(REASON)
  @NoNul(REASON)
  @Max(1000, REASON)
  reason?: string;
  @ApiProperty()
  @IsBoolean({
    message: 'Cần đồng ý để phòng khám sử dụng thông tin nhằm xử lý yêu cầu đặt lịch',
  })
  consent!: boolean;
}
/**
 * The patient's answer to "Cần bổ sung thông tin". The public API never
 * returns the stored details, so every field is optional: a field left out
 * (or blank) keeps its current value, only the fields sent are changed.
 * Phone and email are accepted only unchanged: they cannot be changed from
 * the public page (BookingService.updateDetails).
 */
export class UpdatePublicBookingDetailsDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @Text('Họ và tên')
  @NoNul('Họ và tên')
  @Min(2, 'Họ và tên')
  @Max(200, 'Họ và tên')
  fullName?: string;
  @ApiPropertyOptional({ example: '1990-05-01' })
  @BlankToUndefined()
  @IsOptional()
  @IsCalendarDate('Ngày sinh không hợp lệ')
  dob?: string;
  @ApiPropertyOptional({ enum: Gender })
  @BlankToUndefined()
  @IsOptional()
  @IsEnum(Gender, GENDER)
  gender?: Gender;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(PHONE)
  @NoNul(PHONE)
  @MinLength(9, PHONE_LENGTH)
  @MaxLength(20, PHONE_LENGTH)
  phone?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @NoNul('Email')
  @IsEmail({}, EMAIL)
  email?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(GUARDIAN)
  @NoNul(GUARDIAN)
  @Max(200, GUARDIAN)
  contactPersonName?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(GUARDIAN_PHONE)
  @NoNul(GUARDIAN_PHONE)
  @MaxLength(20, { message: GUARDIAN_PHONE + ' không hợp lệ' })
  contactPersonPhone?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text(REASON)
  @NoNul(REASON)
  @Max(1000, REASON)
  reason?: string;
}
/** The proposal the patient is looking at; refused if the clinic changed it meanwhile. */
export class AcceptBookingProposalDto {
  // An absolute instant (Z or ±hh:mm), compared as such; a zone-less time is ambiguous.
  @ApiPropertyOptional({ example: '2026-10-02T03:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'Giờ đề xuất không hợp lệ' })
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, { message: 'Giờ đề xuất không hợp lệ (thiếu múi giờ)' })
  proposedStartAt?: string;
}
/** The requester's optional note when withdrawing or turning down a proposed time. */
export class PublicBookingNoteDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @Text('Lời nhắn')
  @NoNul('Lời nhắn')
  @Max(1000, 'Lời nhắn')
  message?: string;
}
/** Turning down a proposed time: the one on screen, with an optional note. */
export class DeclineBookingProposalDto extends PublicBookingNoteDto {
  @ApiPropertyOptional({ example: '2026-10-02T03:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'Giờ đề xuất không hợp lệ' })
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, { message: 'Giờ đề xuất không hợp lệ (thiếu múi giờ)' })
  proposedStartAt?: string;
}
export class PublicSlotsQueryDto {
  @ApiProperty() @IsUUID(undefined, { message: 'Vui lòng chọn dịch vụ' }) serviceId!: string;
  @ApiProperty() @IsUUID(undefined, { message: 'Vui lòng chọn bác sĩ' }) dentistId!: string;
  @ApiProperty({ example: '2026-10-01' }) @IsString({ message: 'Chọn ngày hợp lệ' }) date!: string;
  /** Also look for the next day with a free time when this one has none. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === '1' || value === 'true')
  @IsBoolean()
  next?: boolean;
}
// An absolute instant (Z or ±hh:mm): a zone-less time would be read in the
// server's zone (UTC), 7 hours off the clinic's.
const WITH_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;
const STAFF_TIME = { message: 'Giờ hẹn không hợp lệ (cần có múi giờ)' };

export class ProposeBookingTimeDto {
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty() @IsDateString({}, STAFF_TIME) @Matches(WITH_OFFSET, STAFF_TIME) startAt!: string;
  @ApiProperty()
  @Trim()
  @Text('Lời nhắn')
  @NoNul('Lời nhắn')
  @Min(5, 'Lời nhắn')
  @Max(1000, 'Lời nhắn')
  message!: string;
}
export class BookingRequestMessageDto {
  @ApiProperty()
  @Trim()
  @Text('Lời nhắn')
  @NoNul('Lời nhắn')
  @Min(3, 'Lời nhắn')
  @Max(1000, 'Lời nhắn')
  message!: string;
}
/** Declining; `spam`: a junk request, closed without emailing the address it gives. */
export class DeclineBookingRequestDto extends BookingRequestMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() spam?: boolean;
}
export class ConfirmBookingRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;
  /** New patient record even when records share the phone (a child on a parent's phone). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createNewPatient?: boolean;
  /** The picked record is on another phone and the front desk checked it is this person. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confirmIdentity?: boolean;
  /** How the identity was checked (required with confirmIdentity). */
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @NoNul('Ghi chú xác minh')
  @MaxLength(500)
  identityNote?: string;
  /** Replace the picked record's phone with the request's (phone history kept). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() updatePatientPhone?: boolean;
  /** Replace the record's email with the request's (a record without one gets it anyway). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() updatePatientEmail?: boolean;
  /** Book this time instead (the patient agreed to it by phone); `dentistId` optional. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, STAFF_TIME)
  @Matches(WITH_OFFSET, STAFF_TIME)
  startAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() dentistId?: string;
}
/** The front desk corrects the requester's details; `reason` goes to the history. */
export class UpdateBookingContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Text(PHONE)
  @NoNul(PHONE)
  @MinLength(9, PHONE_LENGTH)
  @MaxLength(20, PHONE_LENGTH)
  phone?: string;
  /** '' removes the email. */
  @ApiPropertyOptional()
  @IsOptional()
  @Text('Email')
  @NoNul('Email')
  @MaxLength(255)
  email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @Text('Họ và tên')
  @NoNul('Họ và tên')
  @Min(2, 'Họ và tên')
  @Max(200, 'Họ và tên')
  fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsCalendarDate('Ngày sinh không hợp lệ') dob?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Text(GUARDIAN)
  @NoNul(GUARDIAN)
  @Max(200, GUARDIAN)
  contactPersonName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Text(GUARDIAN_PHONE)
  @NoNul(GUARDIAN_PHONE)
  @MaxLength(20, { message: GUARDIAN_PHONE + ' không hợp lệ' })
  contactPersonPhone?: string;
  @ApiProperty()
  @Trim()
  @Text('Lý do sửa')
  @NoNul('Lý do sửa')
  @Min(3, 'Lý do sửa')
  @Max(500, 'Lý do sửa')
  reason!: string;
}
/** The front desk's internal note on a request ('' clears it). */
export class ReceptionistNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @NoNul('Ghi chú')
  @Max(2000, 'Ghi chú')
  note?: string;
}
/** The patient came to the desk: link today's visit (`appointmentId`) or just close the request. */
export class BookingArrivedDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() appointmentId?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul('Ghi chú')
  @MaxLength(500)
  note?: string;
}
/** Optional note for the history when the front desk records an answer given by phone. */
export class BookingRequestNoteDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul('Ghi chú')
  @MaxLength(500)
  note?: string;
}

export class ListBookingRequestsDto {
  @ApiPropertyOptional({ enum: BookingRequestStatus })
  @IsOptional()
  @IsEnum(BookingRequestStatus)
  status?: BookingRequestStatus;
  /** Reference code, phone or name (any status). */
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul('Từ khóa')
  @MaxLength(100)
  q?: string;
}

/** Open requests for a dentist (or all) whose time falls in [from, to] (clinic dates). */
export class PendingInRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;
  @ApiProperty({ example: '2026-10-01' }) @IsCalendarDate() from!: string;
  @ApiProperty({ example: '2026-10-31' }) @IsCalendarDate() to!: string;
}
