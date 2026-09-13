import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExpenseStatus } from '@prisma/client';

// Bare `@Query('status') status?: ExpenseStatus` on the controller was just
// a TS type annotation with no runtime validation or coercion — page/pageSize
// arrived as strings, and ExpenseListPage's own "Tất cả trạng thái" filter
// sends the literal string `status=all`, which isn't a real ExpenseStatus.
// `where.status = 'all'` in expense.service.ts's list() then 500s in Prisma
// ("Invalid value for argument `status`"). A real DTO makes an invalid
// status/page/pageSize a clean 400 instead, and lets "all" be omitted
// entirely (no filter) rather than sent as a value at all — see the
// matching frontend fix in ExpenseListPage.tsx.
export class ListExpensesQueryDto {
  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter expenseDate >= from (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter expenseDate <= to (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateExpenseDto {
  @ApiProperty({ description: 'Amount in VND' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'Expense description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Expense date (YYYY-MM-DD)' })
  @IsString()
  expenseDate!: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Receipt URL' })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expenseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class ApproveExpenseDto {
  @ApiPropertyOptional({ description: 'Optional notes for approval' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectExpenseDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  reason!: string;
}

export class ReimburseExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
