import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsEmail,
  IsArray,
  ValidateNested,
  IsUUID,
  ArrayMaxSize,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, IdentifierType } from '@prisma/client';

export class PatientIdentifierInputDto {
  @ApiProperty({ enum: IdentifierType })
  @IsEnum(IdentifierType)
  type: IdentifierType;

  @ApiProperty()
  @IsString()
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuedBy?: string;
}

export class CreatePatientDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsDateString()
  dob: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  chronicDiseases?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  currentMedications?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPersonName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPersonPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [PatientIdentifierInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatientIdentifierInputDto)
  identifiers?: PatientIdentifierInputDto[];
}

export class UpdatePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  chronicDiseases?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  currentMedications?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPersonName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPersonPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * `updatedAt` of the patient as the form loaded it. When given, the save is
   * refused with 409 PATIENT_VERSION_CONFLICT if the record changed since.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class SoftDeletePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class OverrideDobDto {
  @ApiProperty()
  @IsDateString()
  dob: string;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Lý do sửa ngày sinh phải có ít nhất 10 ký tự' })
  @MaxLength(1000)
  reason: string;
}

export class ListPatientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dobFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dobTo?: string;

  @ApiPropertyOptional({
    description:
      'Logical status filter. "active" excludes soft-deleted rows, "all" includes them. ' +
      'The database does not yet have an "inactive"/"deceased" column, so those values ' +
      'just return an empty list until the column is added.',
    enum: ['active', 'all'],
  })
  @IsOptional()
  @IsString()
  status?: 'active' | 'all' | string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  includeDeleted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class LookupPatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cccd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

export class MergePatientsDto {
  @ApiProperty()
  @IsUUID()
  sourcePatientId: string;

  @ApiProperty()
  @IsUUID()
  targetPatientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * What a dentist may change on a patient they have treated
 * (patient.medical_history.update): only the clinical history lists, never
 * name, contact or identity fields.
 */
export class UpdateMedicalHistoryDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  chronicDiseases?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  currentMedications?: string[];

  /**
   * `updatedAt` of the patient as the form loaded it. When given, the save is
   * refused with 409 PATIENT_VERSION_CONFLICT if the record changed since.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
