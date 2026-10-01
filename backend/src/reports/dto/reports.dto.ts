import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DashboardRangeQueryDto } from './dashboard.dto';

export class RevenueReportQueryDto {
  @ApiProperty()
  @IsDateString()
  from!: string;

  @ApiProperty()
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ description: 'Applies to every section of the report' })
  @IsOptional()
  @IsUUID()
  dentistId?: string;
}

export class OutstandingReportQueryDto {
  @ApiPropertyOptional({
    description: 'Only balances at least this many days old. Default 0 = every open balance.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  daysOutstanding?: number;
}

export class AppointmentStatsQueryDto extends DashboardRangeQueryDto {
  @ApiPropertyOptional({ description: 'Ignored for a caller limited to their own calendar' })
  @IsOptional()
  @IsUUID()
  dentistId?: string;
}
