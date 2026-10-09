import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import { DashboardRangeQueryDto } from './dto/dashboard.dto';
import {
  AppointmentStatsQueryDto,
  OutstandingReportQueryDto,
  RevenueReportQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Reports page + Dashboard. Routes keep their historical /billing/reports
 * prefix. Only canonical permissions are checked here: FE alias codes
 * (`report.read`, `appointment.read`) gate menus only (A6-25).
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('billing/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  @RequirePermissions('report.revenue.read')
  @ApiOperation({ summary: 'Revenue by issue date, collected by payment date (H7)' })
  async revenueReport(@Query() q: RevenueReportQueryDto) {
    return {
      data: await this.reports.revenueReport({ from: q.from, to: q.to, dentistId: q.dentistId }),
    };
  }

  @Get('outstanding')
  @RequirePermissions('report.outstanding.read')
  @ApiOperation({ summary: 'Every open balance with its age bucket (A6-09)' })
  async outstandingAging(@Query() q: OutstandingReportQueryDto) {
    const rows = await this.reports.outstandingAging({ daysOutstanding: q.daysOutstanding });
    return wrapAsPaginated(rows, rows.length || 20);
  }

  @Get('outstanding-summary')
  @RequirePermissions('report.outstanding.read')
  async outstandingSummary() {
    return this.reports.outstandingSummary();
  }

  @Get('dashboard-kpis')
  @RequirePermissions('report.revenue.read')
  async dashboardKpis(@Query() q: DashboardRangeQueryDto) {
    return this.reports.dashboardKpis({ from: q.from, to: q.to });
  }

  @Get('revenue-by-day')
  @RequirePermissions('report.revenue.read')
  async revenueByDay(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.reports.revenueByDay({ from: q.from, to: q.to }) };
  }

  @Get('revenue-by-month')
  @RequirePermissions('report.revenue.read')
  async revenueByMonth() {
    return { data: await this.reports.revenueByMonth() };
  }

  @Get('revenue-by-source')
  @RequirePermissions('report.revenue.read')
  async revenueBySource(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.reports.revenueBySource({ from: q.from, to: q.to }) };
  }

  @Get('revenue-by-procedure')
  @RequirePermissions('report.revenue.read')
  async revenueByProcedure(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.reports.revenueByProcedure({ from: q.from, to: q.to }) };
  }

  @Get('revenue-by-dentist')
  @RequirePermissions('report.revenue.read')
  async revenueByDentist(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.reports.revenueByDentist({ from: q.from, to: q.to }) };
  }

  @Get('revenue-by-customer-type')
  @RequirePermissions('report.revenue.read')
  @ApiOperation({ summary: 'Revenue of new vs returning patients (A6-13)' })
  async revenueByCustomerType(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.reports.revenueByCustomerType({ from: q.from, to: q.to }) };
  }

  @Get('finance-summary')
  @RequirePermissions('report.revenue.read')
  async financeSummary(@Query() q: DashboardRangeQueryDto) {
    return this.reports.financeSummary({ from: q.from, to: q.to });
  }

  @Get('appointments-by-day')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  async appointmentsByDay(@Query() q: DashboardRangeQueryDto, @User() actor: JwtPayload) {
    return { data: await this.reports.appointmentsByDay({ from: q.from, to: q.to }, actor) };
  }

  @Get('appointment-stats')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'Came / no-show / cancelled / left / walk-in / online (A6-12)' })
  async appointmentStats(@Query() q: AppointmentStatsQueryDto, @User() actor: JwtPayload) {
    return {
      data: await this.reports.appointmentStats(
        { from: q.from, to: q.to, dentistId: q.dentistId },
        actor,
      ),
    };
  }
}
