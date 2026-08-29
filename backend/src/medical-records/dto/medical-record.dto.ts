import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatientType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Clinical note
// ---------------------------------------------------------------------------

export class UpsertClinicalNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  treatmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;
}

export class AddAddendumDto {
  @ApiProperty({ minLength: 3, maxLength: 2000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  content!: string;
}

// ---------------------------------------------------------------------------
// Treatment
// ---------------------------------------------------------------------------

export class CreateTreatmentDto {
  @ApiProperty({ example: 'Composite filling' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  procedure!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 12, minimum: 0 })
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @ApiPropertyOptional({ type: [Number], example: [16, 17] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(11, { each: true })
  @Max(48, { each: true })
  toothNumbers?: number[];

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        inventoryItemId: { type: 'string', format: 'uuid' },
        quantity: { type: 'number', minimum: 0 },
        unit: { type: 'string' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreatmentInventoryUsageInputDto)
  inventoryUsages?: TreatmentInventoryUsageInputDto[];
}

export class TreatmentInventoryUsageInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  quantity!: number;

  @ApiProperty({ example: 'ml' })
  @IsString()
  @MaxLength(20)
  unit!: string;
}

export class UpdateTreatmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  procedure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

/**
 * Update payload for an existing prescription (PATCH). All fields optional;
 * the service applies only the ones that are defined.
 */
export class UpdatePrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePrescriptionDto {
  @ApiPropertyOptional({ description: 'Clinical diagnosis that triggered the prescription' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'General usage instructions for the patient' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiPropertyOptional({ description: 'Free-form note shown to the patient (e.g. follow-up date)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionLineInputDto)
  lines!: PrescriptionLineInputDto[];
}

export class PrescriptionLineInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  drugName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dosage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  frequency?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

// ---------------------------------------------------------------------------
// Dental chart
// ---------------------------------------------------------------------------

export class SnapshotDentalChartDto {
  @ApiProperty({ enum: ['ADULT', 'CHILD'] })
  @IsEnum(PatientType)
  patientType!: 'ADULT' | 'CHILD';

  /** Free-form JSON: e.g., { "16": "Filling", "26": "Crown" } */
  @ApiProperty({ type: Object, additionalProperties: true })
  teeth!: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Encounter close
// ---------------------------------------------------------------------------

export class CloseEncounterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  forceStockOut?: boolean = false;
}

// ---------------------------------------------------------------------------
// Start encounter — appointment → IN_PROGRESS
// ---------------------------------------------------------------------------

export class StartEncounterDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export class ListEncountersQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
