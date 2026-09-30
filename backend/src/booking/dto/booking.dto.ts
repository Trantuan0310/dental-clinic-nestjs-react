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
const NoNul = () => Matches(/^[^\u0000]*$/, { message: '$property chứa ký tự không hợp lệ' });

/** "YYYY-MM-DD" naming a real calendar day (2026-02-30 is not one). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const IsCalendarDate = () =>
  ValidateBy({
    name: 'isCalendarDate',
    validator: {
      validate: value => isCalendarDate(value),
      defaultMessage: () => 'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
    },
  });

export class CreatePublicBookingRequestDto {
  @ApiProperty() @Trim() @IsString() @NoNul() @MinLength(2) @MaxLength(200) fullName!: string;
  @ApiProperty({ example: '1990-05-01' }) @IsCalendarDate() dob!: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender) gender!: Gender;
  @ApiProperty() @IsString() @NoNul() @MinLength(9) @MaxLength(20) phone!: string;
  @ApiPropertyOptional() @BlankToUndefined() @IsOptional() @NoNul() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(200)
  contactPersonName?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(20)
  contactPersonPhone?: string;
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(1000)
  reason?: string;
  @ApiProperty() @IsBoolean() consent!: boolean;
}
/**
 * The patient's answer to "Cần bổ sung thông tin". The public API never
 * returns the stored details, so every field is optional: a field left out
 * (or blank) keeps its current value, only the fields sent are changed.
 */
export class UpdatePublicBookingDetailsDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @NoNul()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;
  @ApiPropertyOptional({ example: '1990-05-01' })
  @BlankToUndefined()
  @IsOptional()
  @IsCalendarDate()
  dob?: string;
  @ApiPropertyOptional({ enum: Gender })
  @BlankToUndefined()
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MinLength(9)
  @MaxLength(20)
  phone?: string;
  @ApiPropertyOptional() @BlankToUndefined() @IsOptional() @NoNul() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(200)
  contactPersonName?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(20)
  contactPersonPhone?: string;
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(1000)
  reason?: string;
}
/** The proposal the patient is looking at; refused if the clinic changed it meanwhile. */
export class AcceptBookingProposalDto {
  // An absolute instant (Z or ±hh:mm), compared as such; a zone-less time is ambiguous.
  @ApiPropertyOptional({ example: '2026-10-02T03:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, { message: 'proposedStartAt phải có múi giờ (Z hoặc ±hh:mm)' })
  proposedStartAt?: string;
}
export class PublicSlotsQueryDto {
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty({ example: '2026-10-01' }) @IsString() date!: string;
  /** Also look for the next day with a free time when this one has none. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === '1' || value === 'true')
  @IsBoolean()
  next?: boolean;
}
export class ProposeBookingTimeDto {
  @ApiProperty() @IsUUID() dentistId!: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(1000) message!: string;
}
export class BookingRequestMessageDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) message!: string;
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
}
/** Optional note for the history when the front desk records an answer given by phone. */
export class BookingRequestNoteDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsString()
  @NoNul()
  @MaxLength(500)
  note?: string;
}

export class ListBookingRequestsDto {
  @ApiPropertyOptional({ enum: BookingRequestStatus })
  @IsOptional()
  @IsEnum(BookingRequestStatus)
  status?: BookingRequestStatus;
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
