import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsHash,
  IsObject,
  IsDefined,
} from 'class-validator';
import { TreatmentInventoryUsageInputDto } from './medical-record.dto';

export class TemplateSoapDto {
  @IsString() @MaxLength(2000) subjective!: string;
  @IsString() @MaxLength(8000) objective!: string;
  @IsString() @MaxLength(2000) assessment!: string;
  @IsString() @MaxLength(4000) plan!: string;
}
export class TemplateTreatmentDto {
  @IsUUID() serviceId!: string;
  @IsInt() @Min(1) @Max(100) quantity!: number;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TreatmentInventoryUsageInputDto)
  inventoryUsages!: TreatmentInventoryUsageInputDto[];
}
export class VisitTemplateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;
  @IsUUID() serviceId!: string;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => TemplateSoapDto) soap!: TemplateSoapDto;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TemplateTreatmentDto)
  treatments!: TemplateTreatmentDto[];
}
export class ApplyVisitTemplateDto {
  @IsUUID() templateId!: string;
  @IsHash('sha256') version!: string;
}
