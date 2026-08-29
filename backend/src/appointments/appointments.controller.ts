import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AppointmentsService } from './appointments.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  ApproveShiftRegistrationDto,
  AvailabilityQueryDto,
  CancelAppointmentDto,
  CheckInAppointmentDto,
  CreateAppointmentDto,
  CreateShiftRegistrationDto,
  CreateTimeOffDto,
  CreateWorkingScheduleDto,
  ListAppointmentsQueryDto,
  NoShowDto,
  RejectShiftRegistrationDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
  WaitingQueueQueryDto,
} from './dto/appointment.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  // ==========================================================================
  // Appointment CRUD
  // ==========================================================================

  @Get()
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'List appointments (BR-APPT-024 row-level for dentist)' })
  async list(@Query() q: ListAppointmentsQueryDto, @User() actor: JwtPayload) {
    return wrapAsPaginated(await this.appointments.list(q, actor));
  }

  // Static sub-routes MUST be declared before the `:id` parameter route so
  // they are not swallowed by `ParseUUIDPipe` (every dynamic param causes a
  // UUID-format 400 otherwise).
  @Get('today')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: "Today's appointments" })
  async today(@User() actor: JwtPayload) {
    return wrapAsPaginated(await this.appointments.listToday(actor));
  }

  @Get('waiting-queue')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'Waiting queue (CHECKED_IN appointments, sorted)' })
  async waitingQueue(@Query() q: WaitingQueueQueryDto, @User() actor: JwtPayload) {
    return wrapAsPaginated(
      await this.appointments.getWaitingQueue(q.dentistId, q.date ?? undefined, actor),
    );
  }

  @Get('availability')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'Slot availability for dentist on a date' })
  async availability(@Query() q: AvailabilityQueryDto) {
    return { data: await this.appointments.getAvailability(q) };
  }

  @Get('dentists')
  @RequirePermissions('appointment.create', 'appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'List active dentists for appointment forms' })
  async dentistOptions() {
    return { data: await this.appointments.listDentistOptions() };
  }

  // ==========================================================================
  // Nested /:id routes — must be declared AFTER every static sub-route above.
  // ==========================================================================

  @Get(':id')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'Get appointment detail by ID' })
  async getById(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.appointments.getById(id, actor) };
  }

  @Patch(':id')
  @RequirePermissions('appointment.update')
  @ApiOperation({
    summary:
      'Update appointment (reason, notes, chiefComplaint only — use /reschedule for date/time/dentist)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.update(id, dto, actor) };
  }

  @Post()
  @RequirePermissions('appointment.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create appointment (BR-APPT-001 → BR-APPT-005)' })
  async create(@Body() dto: CreateAppointmentDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.create(dto, actor) };
  }

  @Patch(':id/reschedule')
  @RequirePermissions('appointment.update')
  @ApiOperation({ summary: 'Reschedule (BR-APPT-013, ≤ 3 times)' })
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.reschedule(id, dto, actor) };
  }

  @Post(':id/check-in')
  @RequirePermissions('appointment.check_in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in (BR-APPT-007)' })
  async checkIn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInAppointmentDto,
    @User() actor: JwtPayload,
  ) {
    return {
      data: await this.appointments.checkIn(id, dto.override ?? false, dto.overrideReason, actor),
    };
  }

  @Post(':id/start-encounter')
  @RequirePermissions('appointment.check_in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition to IN_PROGRESS (after check-in)' })
  async startEncounter(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.appointments.startEncounter(id, actor) };
  }

  @Post(':id/cancel')
  @RequirePermissions('appointment.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel appointment (BR-APPT-009 → BR-APPT-011)' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.cancel(id, dto, actor) };
  }

  @Post(':id/no-show')
  @RequirePermissions('appointment.no_show')
  @HttpCode(HttpStatus.OK)
  async noShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoShowDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.markNoShow(id, dto, actor) };
  }

  // ==========================================================================
  // Working schedule
  // ==========================================================================

  @Post('schedules')
  @RequirePermissions('schedule.write')
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(@Body() dto: CreateWorkingScheduleDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.createWorkingSchedule(dto, actor) };
  }

  @Get('schedules')
  @RequirePermissions('schedule.read')
  async listSchedules(
    @Query('dentistId') dentistId: string | undefined,
    @User() actor: JwtPayload,
  ) {
    return wrapAsPaginated(await this.appointments.listWorkingSchedules(dentistId, actor));
  }

  // ==========================================================================
  // Time-off
  // ==========================================================================

  @Post('time-offs')
  @RequirePermissions('schedule.write')
  @HttpCode(HttpStatus.CREATED)
  async createTimeOff(@Body() dto: CreateTimeOffDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.createTimeOff(dto, actor) };
  }

  @Get('time-offs')
  @RequirePermissions('schedule.read')
  async listTimeOffs(@Query('dentistId') dentistId?: string) {
    return wrapAsPaginated(await this.appointments.listTimeOffs(dentistId));
  }

  // ==========================================================================
  // Shift registration
  // ==========================================================================

  @Post('shift-registrations')
  @RequirePermissions('shift_registration.write')
  @HttpCode(HttpStatus.CREATED)
  async createShiftRegistration(
    @Body() dto: CreateShiftRegistrationDto,
    @User() actor: JwtPayload,
  ) {
    return {
      data: await this.appointments.createShiftRegistration(dto, actor),
    };
  }

  @Get('shift-registrations')
  @RequirePermissions('shift_registration.read')
  async listShiftRegistrations(
    @Query('dentistId') dentistId: string | undefined,
    @Query('status') status: string | undefined,
    @User() actor: JwtPayload,
  ) {
    return wrapAsPaginated(
      await this.appointments.listShiftRegistrations(actor, {
        dentistId,
        status,
      }),
    );
  }

  @Post('shift-registrations/:id/approve')
  @RequirePermissions('shift_registration.approve')
  @HttpCode(HttpStatus.OK)
  async approveShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveShiftRegistrationDto,
    @User() actor: JwtPayload,
  ) {
    return {
      data: await this.appointments.approveShiftRegistration(id, dto.reason, actor),
    };
  }

  @Post('shift-registrations/:id/reject')
  @RequirePermissions('shift_registration.approve')
  @HttpCode(HttpStatus.OK)
  async rejectShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectShiftRegistrationDto,
    @User() actor: JwtPayload,
  ) {
    return {
      data: await this.appointments.rejectShiftRegistration(id, dto.reason, actor),
    };
  }

  @Post('shift-registrations/:id/cancel')
  @RequirePermissions('shift_registration.write')
  @HttpCode(HttpStatus.OK)
  async cancelShift(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return {
      data: await this.appointments.cancelShiftRegistration(id, actor),
    };
  }
}
