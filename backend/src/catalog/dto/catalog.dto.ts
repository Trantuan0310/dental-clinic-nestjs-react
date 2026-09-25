import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { DENTIST_SPECIALTIES } from '../../staff/dto/staff.dto';

const CODE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

export class CreateCategoryDto {
  @ApiProperty({ example: 'DIEU_TRI' })
  @Matches(CODE, { message: 'code: 2–30 uppercase letters, digits, _ or -' })
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ServiceFieldsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  bufferBeforeMin?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  bufferAfterMin?: number;

  @ApiPropertyOptional({ description: 'VND' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ enum: DENTIST_SPECIALTIES, nullable: true })
  @IsOptional()
  @IsIn([...DENTIST_SPECIALTIES, null])
  requiredSpecialty?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class CreateServiceDto extends ServiceFieldsDto {
  @ApiProperty({ example: 'CAO_VOI' })
  @Matches(CODE, { message: 'code: 2–30 uppercase letters, digits, _ or -' })
  code: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Minutes, multiple of 5, 5–480' })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  defaultDurationMin: number;
}

export class UpdateServiceDto extends ServiceFieldsDto {
  @ApiPropertyOptional({ description: 'Minutes, multiple of 5, 5–480' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  defaultDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
}

export class ListServicesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Include inactive services' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class AssignServiceDto {
  @ApiProperty()
  @IsUUID()
  serviceId: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Override of the service duration' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number | null;

  @ApiPropertyOptional({ description: 'Override of the service price (VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  price?: number | null;
}

export class EndAssignmentDto {
  @ApiPropertyOptional({ description: 'Last day (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class OnDateQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
