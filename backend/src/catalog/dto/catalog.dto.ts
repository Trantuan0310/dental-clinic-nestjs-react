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
/** Prices are DECIMAL(15, 0) columns. */
export const MAX_PRICE = 999_999_999_999_999;
const PRICE_MAX_MESSAGE = 'Giá tối đa 999.999.999.999.999 đ';
/** "  " must fail MinLength instead of being stored as "". */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const NAME_MESSAGE = 'Tên phải có ít nhất 2 ký tự';

export class CreateCategoryDto {
  @ApiProperty({ example: 'DIEU_TRI' })
  @Matches(CODE, { message: 'code: 2–30 uppercase letters, digits, _ or -' })
  code: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: NAME_MESSAGE })
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
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: NAME_MESSAGE })
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

  @ApiPropertyOptional({ description: 'VND; required on create unless isFree' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_PRICE, { message: PRICE_MAX_MESSAGE })
  basePrice?: number;

  @ApiPropertyOptional({ description: 'Explicitly free (price 0 shown as "Miễn phí")' })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: 'Patients may request it on the public booking page' })
  @IsOptional()
  @IsBoolean()
  bookableOnline?: boolean;

  @ApiPropertyOptional({ description: 'Listed on the public price list' })
  @IsOptional()
  @IsBoolean()
  showPublicPrice?: boolean;

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
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: NAME_MESSAGE })
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
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: NAME_MESSAGE })
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
  @Max(MAX_PRICE, { message: PRICE_MAX_MESSAGE })
  price?: number | null;
}

/**
 * New duration/price for an assignment from a date on: the running period
 * ends the day before, a new one starts that day. null = back to the
 * service default, omitted = unchanged.
 */
export class ChangeAssignmentDto {
  @ApiProperty({ description: 'First day of the new terms (YYYY-MM-DD), today or later' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_PRICE, { message: PRICE_MAX_MESSAGE })
  price?: number | null;
}

export class ActivateServiceDto {
  @ApiPropertyOptional({
    description: 'Also restore the assignments the last deactivation ended or removed',
  })
  @IsOptional()
  @IsBoolean()
  restoreAssignments?: boolean;
}

export class EndAssignmentDto {
  @ApiPropertyOptional({ description: 'Last day (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ description: 'End it although visits are booked after that day' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class OnDateQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
