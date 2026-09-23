import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsOptional() @IsString() @MaxLength(20)
  phone?: string | null;

  @IsString() @IsNotEmpty() @MaxLength(120)
  specialty!: string;

  @IsOptional() @IsString() @MaxLength(80)
  licenseNumber?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  qualifications?: string | null;

  @Type(() => Number) @IsInt() @Min(0) @Max(60)
  yearsExperience!: number;

  @IsOptional() @IsString() @MaxLength(4000)
  biography?: string | null;

  @IsBoolean()
  acceptingAppointments!: boolean;

  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  serviceIds?: string[];
}
