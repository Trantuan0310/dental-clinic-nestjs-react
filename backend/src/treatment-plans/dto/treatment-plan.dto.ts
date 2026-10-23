import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Highest price a plan line may quote (10 billion đồng). */
export const MAX_PLAN_UNIT_PRICE = 10_000_000_000;

export class TreatmentPlanItemDto {
  @ApiPropertyOptional({ description: 'Catalogue service the line was picked from' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ example: 'Trám răng composite' })
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Tên thủ thuật cần ít nhất 2 ký tự' })
  @MaxLength(200)
  procedure!: string;

  @ApiPropertyOptional({ type: [Number], example: [16, 26] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(52)
  @IsInt({ each: true })
  toothNumbers?: number[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @ApiProperty({ example: 500000, description: 'Quoted price per unit, whole đồng' })
  @IsInt({ message: 'Đơn giá phải là số đồng nguyên' })
  @Min(0)
  @Max(MAX_PLAN_UNIT_PRICE)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateTreatmentPlanDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({
    description: 'Dentist in charge; a dentist always creates their own plans',
  })
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiProperty({ example: 'Niềng răng mắc cài kim loại' })
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Tiêu đề kế hoạch cần ít nhất 3 ký tự' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Encounter the plan was drawn up in' })
  @IsOptional()
  @IsUUID()
  sourceEncounterId?: string;

  @ApiProperty({ type: [TreatmentPlanItemDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TreatmentPlanItemDto)
  items!: TreatmentPlanItemDto[];
}

export class UpdateTreatmentPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Tiêu đề kế hoạch cần ít nhất 3 ký tự' })
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({
    type: [TreatmentPlanItemDto],
    description: 'Replaces every line; only while the plan is a draft or a quote',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TreatmentPlanItemDto)
  items?: TreatmentPlanItemDto[];

  @ApiProperty({ description: 'updatedAt of the plan as last read (stale edits are refused)' })
  @IsDateString()
  expectedUpdatedAt!: string;
}

export class AcceptTreatmentPlanDto {
  @ApiPropertyOptional({ example: 'Khách đồng ý, thanh toán theo từng buổi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class TreatmentPlanReasonDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(5, { message: 'Nhập lý do (ít nhất 5 ký tự)' })
  @MaxLength(1000)
  reason!: string;
}

export class AddTreatmentPlanItemsDto {
  @ApiProperty({ type: [TreatmentPlanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TreatmentPlanItemDto)
  items!: TreatmentPlanItemDto[];
}

export class TreatmentPlanPatientQueryDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;
}
