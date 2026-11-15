import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsAppointmentInstant } from '../../appointments/dto/is-appointment-instant';

export class AppointmentLinkRescheduleDto {
  @IsOptional()
  @IsAppointmentInstant()
  startAt?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  @Matches(/^[^\u0000]*$/)
  note?: string;
}

export class AppointmentLinkCancelDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  @Matches(/^[^\u0000]*$/)
  reason?: string;
}

export class ApproveAppointmentLinkRescheduleDto {
  @IsOptional()
  @IsAppointmentInstant()
  startAt?: string;
}
