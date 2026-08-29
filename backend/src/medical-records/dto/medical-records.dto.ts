import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTreatmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  toothNumbers?: number[];

  @ApiProperty()
  @IsString()
  procedure!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;
}

export class CreateClinicalNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClinicalNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddClinicalNoteAddendumDto {
  @ApiProperty()
  @IsString()
  content!: string;
}

export class CreatePrescriptionLineDto {
  @ApiProperty()
  @IsString()
  drugName!: string;

  @ApiProperty()
  @IsString()
  dosage!: string;

  @ApiProperty()
  @IsString()
  frequency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreatePrescriptionLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionLineDto)
  lines?: CreatePrescriptionLineDto[];
}

export class DentalChartDataDto {
  @ApiProperty()
  @IsString()
  patientType!: 'ADULT' | 'CHILD';

  @ApiProperty()
  @IsArray()
  teeth!: Array<{
    number: number;
    surfaces?: string[];
    condition?: string;
    notes?: string;
  }>;
}

export class CreateEncounterDto {
  @ApiProperty()
  @IsUUID()
  appointmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;
}

export class CloseEncounterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlanText?: string;
}
