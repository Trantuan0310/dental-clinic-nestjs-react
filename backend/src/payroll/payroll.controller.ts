import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, JwtPayload } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { PayrollService } from './payroll.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  UpdatePayrollConfigDto,
  CreateCompensationDto,
  UpdateCompensationDto,
  CreatePayrollPeriodDto,
  AddAdjustmentDto,
  MarkPaidDto,
  ListPeriodsQueryDto,
  ListCompensationsQueryDto,
} from './dto/payroll.dto';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // ============================================================================
  // Config
  // ============================================================================

  @Get('config')
  @RequirePermissions('payroll.config.read')
  @ApiOperation({ summary: 'Get payroll config (singleton)' })
  @ApiResponse({ status: 200, description: 'Payroll config' })
  async getConfig() {
    return { data: await this.payroll.getConfig() };
  }

  @Put('config')
  @RequirePermissions('payroll.config.update')
  @ApiOperation({ summary: 'Update payroll config' })
  @ApiResponse({ status: 200, description: 'Config updated' })
  async updateConfig(@Body() dto: UpdatePayrollConfigDto, @User() user: JwtPayload) {
    const config = await this.payroll.updateConfig(dto, user.sub);
    return { data: config };
  }

  // ============================================================================
  // Compensation
  // ============================================================================

  @Get('compensations')
  @RequirePermissions('payroll.compensation.read')
  @ApiOperation({ summary: 'List dentist compensations' })
  @ApiResponse({ status: 200, description: 'Paginated compensations' })
  async listCompensations(@Query() query: ListCompensationsQueryDto) {
    return wrapAsPaginated(
      await this.payroll.listCompensations({
        dentistId: query.dentistId,
        activeOn: query.activeOn ? new Date(query.activeOn) : undefined,
      }),
    );
  }

  @Post('compensations')
  @RequirePermissions('payroll.compensation.update')
  @ApiOperation({ summary: 'Create dentist compensation' })
  @ApiResponse({ status: 201, description: 'Compensation created' })
  async createCompensation(@Body() dto: CreateCompensationDto, @User() user: JwtPayload) {
    const data = await this.payroll.createCompensation(dto, user.sub);
    return { data };
  }

  @Patch('compensations/:id')
  @RequirePermissions('payroll.compensation.update')
  async updateCompensation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompensationDto,
    @User() user: JwtPayload,
  ) {
    const data = await this.payroll.updateCompensation(id, dto, user.sub);
    return { data };
  }

  @Delete('compensations/:id')
  @RequirePermissions('payroll.compensation.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDeleteCompensation(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    await this.payroll.softDeleteCompensation(id, user.sub);
  }

  // ============================================================================
  // Periods
  // ============================================================================

  @Get('periods')
  @RequirePermissions('payroll.read.any')
  @ApiOperation({ summary: 'List payroll periods' })
  async listPeriods(@Query() query: ListPeriodsQueryDto) {
    return wrapAsPaginated(
      await this.payroll.listPeriods({
        status: query.status as any,
        year: query.year,
      }),
    );
  }

  @Post('periods')
  @RequirePermissions('payroll.period.create')
  @ApiOperation({ summary: 'Create new payroll period' })
  async createPeriod(@Body() dto: CreatePayrollPeriodDto, @User() user: JwtPayload) {
    const data = await this.payroll.createPeriod(dto, user.sub);
    return { data };
  }

  @Get('periods/:id')
  @RequirePermissions('payroll.read.any')
  @ApiOperation({ summary: 'Get period detail with line items' })
  async getPeriodDetail(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.payroll.getPeriodDetail(id);
    return { data };
  }

  @Post('periods/:id/compute')
  @RequirePermissions('payroll.period.compute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute or re-compute payroll period' })
  async computePeriod(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const data = await this.payroll.computePeriod(id, user.sub);
    return { data };
  }

  @Post('periods/:id/adjustments')
  @RequirePermissions('payroll.period.adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add manual adjustment to line item' })
  async addAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAdjustmentDto,
    @User() user: JwtPayload,
  ) {
    const data = await this.payroll.addAdjustment(id, dto, user.sub, user.permissions);
    return { data };
  }

  @Post('periods/:id/lock')
  @RequirePermissions('payroll.period.lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock period (DRAFT → REVIEWING)' })
  async lockPeriod(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const data = await this.payroll.lockPeriod(id, user.sub);
    return { data };
  }

  @Post('periods/:id/approve')
  @RequirePermissions('payroll.period.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve period (REVIEWING → APPROVED)' })
  async approvePeriod(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const data = await this.payroll.approvePeriod(id, user.sub);
    return { data };
  }

  @Post('periods/:id/mark-paid')
  @RequirePermissions('payroll.period.mark_paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark period as paid (APPROVED → PAID)' })
  async markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
    @User() user: JwtPayload,
  ) {
    const data = await this.payroll.markPaid(id, dto, user.sub);
    return { data };
  }

  @Post('periods/:id/open-adjustment')
  @RequirePermissions('payroll.period.adjust')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'BR-PAY-019: Open an adjustment period tied to a PAID/LOCKED original. Original is NOT modified.',
  })
  async openAdjustment(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const data = await this.payroll.openAdjustmentPeriod(id, user.sub, user.permissions ?? []);
    return { data };
  }

  // ============================================================================
  // Dentist views (own)
  // ============================================================================

  @Get('me/history')
  @RequirePermissions('payroll.read.own')
  @ApiOperation({ summary: 'My payroll history' })
  async myHistory(@User() user: JwtPayload) {
    const data = await this.payroll.getMyHistory(user.sub);
    return { data };
  }

  @Get('me/payslip/:periodId')
  @RequirePermissions('payslip.read.own')
  @ApiOperation({ summary: 'My payslip for a period' })
  async myPayslip(@Param('periodId', ParseUUIDPipe) periodId: string, @User() user: JwtPayload) {
    const data = await this.payroll.getMyPayslip(periodId, user.sub);
    return { data };
  }

  @Get('me/compensation')
  @RequirePermissions('payroll.compensation.read')
  @ApiOperation({ summary: 'My current compensation' })
  async myCompensation(@User() user: JwtPayload) {
    const data = await this.payroll.getMyCurrentCompensation(user.sub);
    return { data };
  }

  @Get('me/preview')
  @RequirePermissions('payroll.read.own')
  @ApiOperation({ summary: 'Preview estimated pay for current DRAFT period' })
  async myPreview(@User() user: JwtPayload) {
    const data = await this.payroll.getMyPreview(user.sub);
    return { data };
  }
}
