import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateClinicServiceDto {
  @IsString() @IsNotEmpty() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(40)
  code!: string;

  @IsString() @IsNotEmpty() @MaxLength(160)
  name!: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  category!: string;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  durationMinutes!: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  basePrice!: number;

  @IsBoolean()
  requiresConsultation!: boolean;
}

export class UpdateClinicServiceDto {
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(40)
  code?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80)
  category?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  durationMinutes?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  basePrice?: number;

  @IsOptional() @IsBoolean()
  requiresConsultation?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
