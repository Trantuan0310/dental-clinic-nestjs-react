import { IsString, IsOptional, IsDateString, IsEnum, IsUUID, IsNumber, Min } from 'class-validator';
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  status?: InvoiceStatus[];
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
