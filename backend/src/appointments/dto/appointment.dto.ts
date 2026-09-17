import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, AppointmentSource, ShiftType, TimeOffType } from '@prisma/client';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
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
}

export class CancelAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
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
  @ApiProperty()
  @IsDateString()
  newStartsAt!: string;

  @ApiProperty()
  @IsDateString()
  newEndsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  newDentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
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
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
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

  @ApiPropertyOptional({ description: 'Cursor (last seen appointment ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDuration?: number;
}

export class WaitingQueueQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @IsString()
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  slotDurationMin?: number;

  @ApiProperty()
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isPaidShift?: boolean;

  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;
}

export class CreateTimeOffDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiProperty({ enum: TimeOffType })
  @IsEnum(TimeOffType)
  type!: TimeOffType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateShiftRegistrationDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty()
  @IsString()
  date!: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
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
