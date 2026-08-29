import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
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
