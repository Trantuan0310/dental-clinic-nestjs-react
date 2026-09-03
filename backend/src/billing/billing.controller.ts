import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, JwtPayload } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { InvoiceStatus } from '@prisma/client';
import { BillingService } from './billing.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  IssueInvoiceDto,
  ListInvoicesQueryDto,
  OutstandingReportQueryDto,
  RecordPaymentDto,
  RevenueReportQueryDto,
  UpdateDiscountDto,
  UpdateInvoiceNotesDto,
  VoidInvoiceDto,
} from './dto/billing.dto';
import { DashboardRangeQueryDto } from './dto/dashboard.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ==========================================================================
  // Invoices
  // ==========================================================================

  @Get('invoices')
  @RequirePermissions('invoice.read.any', 'invoice.read.own')
  @ApiOperation({ summary: 'List invoices (BR-BILL-003 row-level for dentist)' })
  async list(@Query() q: ListInvoicesQueryDto, @User() actor: JwtPayload) {
    return wrapAsPaginated(
      await this.billing.listInvoices({
        q: q.q,
        patientId: q.patientId,
        dentistId: q.dentistId,
        from: q.from,
        to: q.to,
        status: q.status as InvoiceStatus[] | undefined,
        pageSize: q.pageSize,
        actor,
      }),
    );
  }

  @Get('invoices/:id')
  @RequirePermissions('invoice.read.any', 'invoice.read.own')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.billing.getInvoiceById(id, actor) };
  }

  @Post('invoices/:id/issue')
  @RequirePermissions('invoice.issue')
  @HttpCode(HttpStatus.OK)
  async issue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueInvoiceDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.billing.issue(id, dto, actor) };
  }

  @Put('invoices/:id/discount')
  @RequirePermissions('invoice.update')
  async updateDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.billing.updateDiscount(id, dto, actor) };
  }

  @Put('invoices/:id/notes')
  @RequirePermissions('invoice.update')
  async updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceNotesDto,
    @User() _actor: JwtPayload,
  ) {
    return { data: await this.billing.updateNotes(id, dto) };
  }

  @Post('invoices/:id/void')
  @RequirePermissions('invoice.void')
  @HttpCode(HttpStatus.OK)
  async voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.billing.voidInvoice(id, dto, actor) };
  }

  @Post('invoices/:id/payments')
  @RequirePermissions('invoice.payment.create')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.billing.recordPayment(id, dto, actor) };
  }

  @Get('invoices/:id/audits')
  @RequirePermissions('invoice.audit.read')
  async audits(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return wrapAsPaginated(await this.billing.getInvoiceAudits(id, actor));
  }

  @Get('invoices/by-encounter/:encounterId')
  @RequirePermissions('invoice.read.any', 'invoice.read.own')
  async byEncounter(@Param('encounterId', ParseUUIDPipe) encounterId: string) {
    return wrapAsPaginated([await this.billing.getInvoiceByEncounterId(encounterId)]);
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  @Get('reports/revenue')
  @RequirePermissions('report.revenue.read')
  async revenueReport(@Query() q: RevenueReportQueryDto) {
    return this.billing.revenueReport({
      from: q.from,
      to: q.to,
      dentistId: q.dentistId,
    });
  }

  @Get('reports/outstanding')
  @RequirePermissions('report.outstanding.read')
  async outstandingAging(@Query() q: OutstandingReportQueryDto) {
    return wrapAsPaginated(
      await this.billing.outstandingAging({
        daysOutstanding: q.daysOutstanding ?? 30,
      }),
    );
  }

  // ==========================================================================
  // Dashboard analytics (Phase 10)
  // ==========================================================================

  @Get('reports/dashboard-kpis')
  @RequirePermissions('report.revenue.read', 'report.read')
  async dashboardKpis(@Query() q: DashboardRangeQueryDto) {
    return this.billing.dashboardKpis({ from: q.from, to: q.to });
  }

  @Get('reports/revenue-by-day')
  @RequirePermissions('report.revenue.read', 'report.read')
  async revenueByDay(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.billing.revenueByDay({ from: q.from, to: q.to }) };
  }

  @Get('reports/revenue-by-month')
  @RequirePermissions('report.revenue.read', 'report.read')
  async revenueByMonth() {
    return { data: await this.billing.revenueByMonth() };
  }

  @Get('reports/appointments-by-day')
  @RequirePermissions('appointment.read', 'report.read')
  async appointmentsByDay(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.billing.appointmentsByDay({ from: q.from, to: q.to }) };
  }

  @Get('reports/revenue-by-source')
  @RequirePermissions('report.revenue.read', 'report.read')
  async revenueBySource(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.billing.revenueBySource({ from: q.from, to: q.to }) };
  }

  @Get('reports/revenue-by-procedure')
  @RequirePermissions('report.revenue.read', 'report.read')
  async revenueByProcedure(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.billing.revenueByProcedure({ from: q.from, to: q.to }) };
  }

  @Get('reports/revenue-by-dentist')
  @RequirePermissions('report.revenue.read', 'report.read')
  async revenueByDentist(@Query() q: DashboardRangeQueryDto) {
    return { data: await this.billing.revenueByDentist({ from: q.from, to: q.to }) };
  }

  @Get('reports/finance-summary')
  @RequirePermissions('report.revenue.read', 'report.read')
  async financeSummary(@Query() q: DashboardRangeQueryDto) {
    return this.billing.financeSummary({ from: q.from, to: q.to });
  }

  @Get('reports/outstanding-summary')
  @RequirePermissions('report.outstanding.read')
  async outstandingSummary() {
    return this.billing.outstandingSummary();
  }
}
