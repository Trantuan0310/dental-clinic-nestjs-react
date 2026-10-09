import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AppointmentStatus,
  AppointmentSource,
  AppointmentType,
  ScheduleOverrideKind,
  ShiftType,
  TimeOffStatus,
  TimeOffType,
} from '@prisma/client';
import { IsCalendarDate } from '../../common/validators/is-calendar-date';
import { IsClinicTime } from '../../common/validators/is-clinic-time';
import { IsAppointmentInstant, MAX_VISIT_MINUTES } from './is-appointment-instant';
import { ReasonText } from '../../common/validators/reason-text';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ example: '2026-10-22T09:00:00+07:00' })
  @IsAppointmentInstant()
  startAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsAppointmentInstant()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ enum: AppointmentSource })
  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @ApiPropertyOptional({ enum: AppointmentType })
  @IsOptional()
  @IsEnum(AppointmentType)
  appointmentType?: AppointmentType;

  @ApiPropertyOptional({
    type: [String],
    description: 'Catalogue services (≤ 5); duration and buffers are derived from them',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({
    description: 'Required when endAt gives a different length than the services add up to',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  durationOverrideReason?: string;
}

/** A patient who walks in now (ADR-0009 phase 5): booked and checked in at once. */
export class CreateWalkInDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({ description: 'Visit length when no services are chosen' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(MAX_VISIT_MINUTES)
  durationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ enum: AppointmentType })
  @IsOptional()
  @IsEnum(AppointmentType)
  appointmentType?: AppointmentType;

  @ApiPropertyOptional({
    description: "Confirms a visit running past the end of the dentist's hours (A3-02)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overtimeReason?: string;

  @ApiPropertyOptional({
    description: 'The patient has a booking to come and this is another visit (A3-08)',
  })
  @IsOptional()
  @IsBoolean()
  ignoreUpcomingBookings?: boolean;
}

export class MarkLeftDto {
  @ApiProperty()
  @ReasonText(5, 500)
  reason!: string;
}

/** Undo of a check-in, a no-show or a LEFT: the reason is kept in the history. */
export class StatusReasonDto {
  @ApiProperty({ description: 'Why the status is undone (≥ 5 characters)' })
  @ReasonText(5, 500)
  reason!: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ enum: AppointmentType })
  @IsOptional()
  @IsEnum(AppointmentType)
  appointmentType?: AppointmentType;
}

export class CancelAppointmentDto {
  @ApiProperty({ description: 'Why the visit is cancelled (≥ 5 characters)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Vui lòng nhập lý do hủy lịch' })
  @MinLength(5, { message: 'Lý do hủy lịch cần ít nhất 5 ký tự' })
  @MaxLength(500, { message: 'Lý do hủy lịch tối đa 500 ký tự' })
  reason!: string;

  // Optimistic guard: the values the client last saw. A visit moved or
  // edited since is a 409 instead of cancelling the wrong booking; older
  // clients that send neither skip the check.
  @ApiPropertyOptional({ description: 'rescheduleCount the client last saw' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rescheduleCount?: number;

  @ApiPropertyOptional({ description: 'updatedAt the client last saw (ISO)' })
  @IsOptional()
  @IsCalendarDate()
  updatedAt?: string;
}

export class NoShowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CheckInAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  override?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-10-22T09:00:00+07:00' })
  @IsAppointmentInstant()
  newStartsAt!: string;

  @ApiProperty()
  @IsAppointmentInstant()
  newEndsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  newDentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Required when the new length differs from the services total (BR-APPT-031)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  durationOverrideReason?: string;

  // Optimistic guard as on cancel (A3-12): a visit moved since the client
  // read it is a 409, not moved again; older clients sending neither skip it.
  @ApiPropertyOptional({ description: 'rescheduleCount the client last saw' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rescheduleCount?: number;

  @ApiPropertyOptional({ description: 'updatedAt the client last saw (ISO)' })
  @IsOptional()
  @IsCalendarDate()
  updatedAt?: string;
}

export class ListAppointmentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  // Three boundary quirks fixed here:
  // 1. A single `?status=checked_in` query value arrives as a bare string,
  //    not a 1-element array — Express only produces an array for repeated
  //    keys (`?status=a&status=b`) or bracket notation (`?status[]=a`).
  //    `{ status: { in: q.status } }` 500s in Prisma if given a string.
  // 2. The frontend's own AppointmentStatus domain is lower_snake_case
  //    ('checked_in') while Prisma's generated enum is UPPER_SNAKE_CASE
  //    ('CHECKED_IN') — passing the former straight through also 500s
  //    ("Invalid value for argument `in`. Expected AppointmentStatus.").
  // 3. `?status=a,b,c` (one comma-joined value, as e.g. OutstandingCard's
  //    invoice-status links use) used to survive #1's wrapping as a single
  //    garbage element ['A,B,C'] — not a real enum value, so Prisma 500s.
  //    Split every element on ',' too so repeated-param and comma-joined
  //    forms both work.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => {
    const arr = Array.isArray(value) ? value : value !== undefined ? [value] : value;
    return arr?.flatMap((v: string) => v.split(',')).map((v: string) => v.trim().toUpperCase());
  })
  @IsArray()
  @IsEnum(AppointmentStatus, { each: true })
  status?: AppointmentStatus[];

  @ApiPropertyOptional({ description: 'Page size (1-200). Defaults to 50.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Cursor (last seen appointment ID)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description:
      'By start time. Default: newest first for one patient without `from`, else oldest first',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';
}

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ description: 'Clinic date YYYY-MM-DD' })
  @IsCalendarDate()
  date!: string;

  // Visit length in minutes. Services may be as short as 5 min (catalogue
  // DTO), so a short visit's reschedule picker must still get slots.
  @ApiPropertyOptional({ description: 'Visit length; defaults to the shift slot step' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(MAX_VISIT_MINUTES)
  slotDuration?: number;

  @ApiPropertyOptional({ description: 'Prep time before each visit (D4)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  bufferBeforeMin?: number;

  @ApiPropertyOptional({ description: 'Clean-up time after each visit (D4)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  bufferAfterMin?: number;

  @ApiPropertyOptional({ description: 'A visit being rescheduled: its own time counts as free' })
  @IsOptional()
  @IsUUID()
  excludeAppointmentId?: string;
}

export class AvailabilitySearchQueryDto {
  @ApiProperty({ description: 'Clinic date YYYY-MM-DD' })
  @IsCalendarDate()
  date!: string;

  @ApiPropertyOptional({ description: 'Only dentists assigned this service that day' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Visit length; defaults to the dentist/service duration' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(5)
  @Max(MAX_VISIT_MINUTES)
  durationMin?: number;
}

export class WaitingQueueQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  cursor?: string;
}

export class CreateWorkingScheduleDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '08:00' })
  @IsClinicTime()
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @IsClinicTime()
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDurationMin?: number;

  @ApiProperty()
  @IsCalendarDate()
  validFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCalendarDate()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isPaidShift?: boolean;

  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;
}

/** One working block of a day ("HH:mm", clinic time). */
export class TimeBlockDto {
  @ApiProperty({ example: '08:00' })
  @IsClinicTime()
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @IsClinicTime()
  endTime!: string;
}

export class ScheduleBlockDto extends TimeBlockDto {
  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;
}

/** Several weekdays × several blocks in one save (one transaction). */
export class BulkCreateWorkingSchedulesDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5, 6] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một thứ trong tuần' })
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @ApiProperty({ type: [ScheduleBlockDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Thêm ít nhất một khung giờ' })
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  blocks!: ScheduleBlockDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDurationMin?: number;

  @ApiProperty()
  @IsCalendarDate()
  validFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCalendarDate()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPaidShift?: boolean;
}

/**
 * PATCH /appointments/schedules/:id. Changing the hours/day of a schedule
 * already in effect applies "from effectiveFrom" (default today): the old row
 * ends the day before and a new row starts that day, so past days (payroll)
 * keep the hours they had. `validTo` alone ends (or extends) the schedule.
 */
export class UpdateWorkingScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsClinicTime()
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsClinicTime()
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDurationMin?: number;

  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPaidShift?: boolean;

  @ApiPropertyOptional({ description: 'Last working day (inclusive); null = open-ended' })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsCalendarDate()
  validTo?: string | null;

  @ApiPropertyOptional({ description: 'Clinic date the new hours start from; default today' })
  @IsOptional()
  @IsCalendarDate()
  effectiveFrom?: string;
}

export class CreateTimeOffDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsCalendarDate()
  startAt!: string;

  @ApiProperty()
  @IsCalendarDate()
  endAt!: string;

  @ApiProperty({ enum: TimeOffType })
  @IsEnum(TimeOffType)
  type!: TimeOffType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListTimeOffsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ enum: TimeOffStatus })
  @IsOptional()
  @IsEnum(TimeOffStatus)
  status?: TimeOffStatus;
}

export class DecideTimeOffDto {
  @ApiPropertyOptional({ description: 'Required when rejecting' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateScheduleOverrideDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ description: 'Clinic date YYYY-MM-DD' })
  @IsCalendarDate()
  date!: string;

  @ApiProperty({ enum: ScheduleOverrideKind })
  @IsEnum(ScheduleOverrideKind)
  kind!: ScheduleOverrideKind;

  @ApiPropertyOptional({ description: 'HH:mm; with endTime. CLOSED without times = whole day' })
  @IsOptional()
  @IsClinicTime()
  startTime?: string;

  @ApiPropertyOptional({ description: 'HH:mm' })
  @IsOptional()
  @IsClinicTime()
  endTime?: string;

  @ApiPropertyOptional({
    type: [TimeBlockDto],
    description:
      'CHANGED_HOURS only: several blocks for the day (e.g. keep a lunch break); replaces startTime/endTime',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimeBlockDto)
  ranges?: TimeBlockDto[];

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListScheduleOverridesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ description: 'From clinic date (inclusive), defaults to today' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;
}

export class ScheduleImpactQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ description: 'Clinic date YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ description: 'Clinic date YYYY-MM-DD, defaults to from + 60 days' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}

export class CreateShiftRegistrationDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsCalendarDate()
  date!: string;

  @ApiProperty({ example: '08:00' })
  @IsClinicTime()
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsClinicTime()
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxEncounters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveShiftRegistrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectShiftRegistrationDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class ClinicClosureDto {
  @ApiProperty({ description: 'First closed clinic date YYYY-MM-DD' })
  @IsCalendarDate()
  startDate!: string;

  @ApiProperty({ description: 'Last closed clinic date YYYY-MM-DD (inclusive)' })
  @IsCalendarDate()
  endDate!: string;

  @ApiProperty({ example: 'Nghỉ Tết Nguyên đán' })
  @IsString()
  @MinLength(3, { message: 'Lý do tối thiểu 3 ký tự' })
  @MaxLength(500)
  reason!: string;
}

export class ListClinicClosuresQueryDto {
  @ApiPropertyOptional({ description: 'Closures ending on/after this date; defaults to today' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;
}
