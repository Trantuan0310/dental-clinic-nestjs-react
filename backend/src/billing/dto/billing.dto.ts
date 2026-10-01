import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
  IsNumber,
  IsInt,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Reasons are kept in the audit trail; a few words at least (A2-28). */
const Reason = () =>
  applyDecorators(
    Trim(),
    IsString(),
    MinLength(5, { message: 'Lý do cần ít nhất 5 ký tự' }),
    MaxLength(500),
  );

// VND has no subunit: amounts are whole đồng (A2-11).
const WholeDong = () =>
  IsNumber({ maxDecimalPlaces: 0 }, { message: 'Số tiền phải là số đồng nguyên' });

export class RecordPaymentDto {
  @ApiProperty()
  @WholeDong()
  @Min(1)
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

  /** Required for any discount above 0 (kept in the invoice history). */
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;

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
  @Reason()
  reason!: string;

  @ApiProperty()
  @IsNumber()
  version!: number;
}

/** Cancel a payment or refund row entered by mistake. */
export class VoidPaymentDto {
  @ApiProperty()
  @Reason()
  reason!: string;
}

/** Money handed back to the patient (dated today). */
export class RefundDto {
  @ApiProperty()
  @WholeDong()
  @Min(1)
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty()
  @Reason()
  reason!: string;

  @ApiProperty()
  @IsNumber()
  version!: number;
}

/** Fix one line of a DRAFT invoice (price, quantity, wording) or drop it. */
export class UpdateInvoiceItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @WholeDong()
  @Min(0)
  @Max(999_999_999, { message: 'Đơn giá vượt quá giới hạn cho phép' })
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100, { message: 'Số lượng tối đa 100' })
  quantity?: number;

  @ApiPropertyOptional({ description: 'Drop the line from the invoice' })
  @IsOptional()
  @IsBoolean()
  remove?: boolean;

  @ApiProperty()
  @Reason()
  reason!: string;

  @ApiProperty()
  @IsNumber()
  version!: number;
}

/** Re-make the invoice of an encounter whose invoice was voided. */
export class ReissueInvoiceDto {
  @ApiProperty()
  @Reason()
  reason!: string;
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

  @ApiPropertyOptional({ description: 'Invoice id cursor for the next page' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
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
