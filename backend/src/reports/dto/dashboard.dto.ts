import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DashboardRangeQueryDto {
  @ApiPropertyOptional({
    description: 'ISO date yyyy-MM-dd. Defaults to first day of the year if absent.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date yyyy-MM-dd. Defaults to today if absent.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DashboardKpiDeltaDto {
  @ApiProperty() total!: number;
  @ApiPropertyOptional() newCount?: number;
  @ApiPropertyOptional() returningCount?: number;
  @ApiProperty() pctChange!: number;
  @ApiProperty({ type: [Object] }) sparkline!: Array<{ date: string; value: number }>;
}

export class DashboardKpisDto {
  @ApiProperty({ type: DashboardKpiDeltaDto }) patients!: DashboardKpiDeltaDto;
  @ApiProperty({ type: DashboardKpiDeltaDto }) appointments!: DashboardKpiDeltaDto;
  @ApiProperty({ type: DashboardKpiDeltaDto }) treatmentRevenue!: DashboardKpiDeltaDto;
  @ApiProperty({ type: DashboardKpiDeltaDto }) collected!: DashboardKpiDeltaDto;
}

export class DashboardDailyPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() invoiceCount!: number;
}

export class DashboardMonthlyPointDto {
  @ApiProperty() month!: string;
  @ApiProperty() revenue!: number;
}

export class DashboardAppointmentPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() count!: number;
}

export class FinanceSummaryDto {
  @ApiProperty() totalIncome!: number;
  @ApiProperty() totalExpense!: number;
}

export class OutstandingSummaryDto {
  @ApiProperty() totalDebt!: number;
  @ApiProperty() invoiceCount!: number;
}

export class RevenueBySourceDto {
  @ApiProperty() source!: string;
  @ApiProperty() sourceLabel!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() percentage!: number;
  @ApiProperty() count!: number;
}

export class RevenueByProcedureDto {
  @ApiProperty() procedure!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() count!: number;
}

export class RevenueByDentistDto {
  @ApiProperty() dentistId!: string;
  @ApiProperty() dentistName!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() percentage!: number;
  @ApiProperty() count!: number;
}
