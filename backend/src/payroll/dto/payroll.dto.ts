import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsUUID,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollCycle, PayrollAdjustmentType } from '@prisma/client';

export class UpdatePayrollConfigDto {
  @ApiPropertyOptional({ enum: PayrollCycle })
  @IsOptional()
  @IsEnum(PayrollCycle)
  payrollCycle?: PayrollCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  overtimeMultiplier?: number;

  @ApiPropertyOptional({
    description: 'Thuế TNCN mặc định (0-1), áp dụng khi chưa có bracket override',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultTaxTncnPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bhxhPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bhytPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bhtnPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minGrossForBhxh?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  probationSalaryPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  taxBrackets?: Array<{
    min: number;
    max?: number;
    rate: number;
  }>;
}

export class CreateCompensationDto {
  @ApiProperty()
  @IsUUID()
  dentistId: string;

  @ApiProperty()
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  baseSalaryVnd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionPct: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeHourlyVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCompensationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalaryVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeHourlyVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePayrollPeriodDto {
  @ApiProperty()
  @IsDateString()
  periodStart: string;

  @ApiProperty()
  @IsDateString()
  periodEnd: string;

  @ApiProperty({ enum: PayrollCycle })
  @IsEnum(PayrollCycle)
  payrollCycle: PayrollCycle;
}

export class AddAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  lineItemId: string;

  @ApiProperty({ enum: PayrollAdjustmentType })
  @IsEnum(PayrollAdjustmentType)
  type: PayrollAdjustmentType;

  @ApiProperty()
  @IsNumber()
  amountVnd: number;

  @ApiProperty()
  @IsString()
  reason: string;
}

export class MarkPaidDto {
  @ApiProperty()
  @IsDateString()
  paymentDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentReference?: string;
}

export class ListPeriodsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  year?: number;
}

export class ListCompensationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description: 'Filter to comps active on this date',
  })
  @IsOptional()
  @IsDateString()
  activeOn?: string;
}
