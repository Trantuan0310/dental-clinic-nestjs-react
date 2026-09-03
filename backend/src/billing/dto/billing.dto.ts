import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateDiscountDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  discountValue!: number;

  @ApiProperty({ enum: ['PERCENT', 'AMOUNT'] })
  @IsEnum(['PERCENT', 'AMOUNT'])
  discountType!: 'PERCENT' | 'AMOUNT';

  @ApiProperty()
  @IsNumber()
  version!: number;
}

export class UpdateInvoiceNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty()
  @IsNumber()
  version!: number;
}

export class IssueInvoiceDto {
  @ApiProperty()
  @IsNumber()
  version!: number;
}

export class VoidInvoiceDto {
  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiProperty()
  @IsNumber()
  version!: number;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Search by invoice code or patient name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  // A single `?status=PAID` query value arrives as the bare string "PAID",
  // not `["PAID"]` — Prisma's `where.status.in` needs an actual array, and
  // silently got a string, which 500'd. Coerce single values into a
  // one-element array so both single- and multi-select filters work.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsEnum(InvoiceStatus, { each: true })
  status?: InvoiceStatus[];

  @ApiPropertyOptional({ description: 'Page size (1-100). Defaults to 100.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class RevenueReportQueryDto {
  @ApiProperty()
  @IsDateString()
  from!: string;

  @ApiProperty()
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;
}

export class OutstandingReportQueryDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  @IsNumber()
  daysOutstanding!: number;
}
