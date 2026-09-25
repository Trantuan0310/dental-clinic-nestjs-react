import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
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
import { Type } from 'class-transformer';
import { EmployeeType, EmploymentStatus, Gender, PracticeStatus } from '@prisma/client';

/** Fixed specialty codes for dentist_profiles.specialties (staff.md §3). */
export const DENTIST_SPECIALTIES = [
  'TONG_QUAT',
  'NHA_CHU',
  'NOI_NHA',
  'CHINH_NHA',
  'NHO_RANG',
  'PHUC_HINH',
  'IMPLANT',
  'NHA_TRE_EM',
  'THAM_MY',
] as const;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ description: 'Search by code, name, phone or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: EmployeeType })
  @IsOptional()
  @IsEnum(EmployeeType)
  type?: EmployeeType;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ enum: EmployeeType })
  @IsEnum(EmployeeType)
  employeeType: EmployeeType;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dob?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Contact email (not the login email)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ enum: EmployeeType })
  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dob?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({
    enum: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE],
    description: 'Use POST /employees/:id/terminate to terminate',
  })
  @IsOptional()
  @IsIn([EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE])
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class TerminateEmployeeDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class LinkAccountDto {
  @ApiPropertyOptional({ description: 'Link an existing account' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Or create a new account with this login email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  loginEmail?: string;
}

export class CreateDentistProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  licenseIssuedAt?: string | null;

  @ApiPropertyOptional({ enum: DENTIST_SPECIALTIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DENTIST_SPECIALTIES.length)
  @IsIn(DENTIST_SPECIALTIES, { each: true })
  specialties?: string[];

  @ApiPropertyOptional({ example: '#2563EB' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'calendarColor must be #RRGGBB' })
  calendarColor?: string;

  @ApiPropertyOptional({ minimum: 15, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(120)
  defaultSlotMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsOnlineBooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsNewPatients?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null;
}

/** Everything but practiceStatus, which has its own endpoints (BR-STAFF-004). */
export class UpdateDentistProfileDto extends CreateDentistProfileDto {}

/** Fields a dentist may change on their own profile (dentist.update.own). */
export const DENTIST_SELF_EDITABLE_FIELDS = ['bio', 'specialties', 'calendarColor'] as const;

export class ListDentistsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: PracticeStatus })
  @IsOptional()
  @IsEnum(PracticeStatus)
  status?: PracticeStatus;
}

export class ChangePracticeStatusDto {
  @ApiProperty({ enum: [PracticeStatus.SUSPENDED, PracticeStatus.INACTIVE] })
  @IsIn([PracticeStatus.SUSPENDED, PracticeStatus.INACTIVE])
  status: PracticeStatus;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
