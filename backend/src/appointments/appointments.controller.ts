import {
  Delete,
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
import { AvailabilityService } from './availability.service';
import { ShiftRegistrationService } from '../payroll/shift-registration.service';
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
  AvailabilitySearchQueryDto,
  CreateScheduleOverrideDto,
  CreateWalkInDto,
  MarkLeftDto,
  DecideTimeOffDto,
  ListScheduleOverridesQueryDto,
  ListTimeOffsQueryDto,
  ScheduleImpactQueryDto,
} from './dto/appointment.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly shiftRegistrations: ShiftRegistrationService,
    private readonly availabilityService: AvailabilityService,
  ) {}

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

  @Get('availability/search')
  @RequirePermissions('appointment.create', 'appointment.read.any')
  @ApiOperation({
    summary:
      'Free start times per active dentist on a date, optionally only those assigned a service',
  })
  async searchAvailability(@Query() q: AvailabilitySearchQueryDto) {
    return { data: await this.availabilityService.search(q) };
  }

  @Get('dentists')
  @RequirePermissions('appointment.create', 'appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'List active dentists for appointment forms' })
  async dentistOptions() {
    return { data: await this.appointments.listDentistOptions() };
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
  async listTimeOffs(@Query() query: ListTimeOffsQueryDto) {
    return wrapAsPaginated(await this.appointments.listTimeOffs(query));
  }

  @Post('time-offs/:id/approve')
  @RequirePermissions('time_off.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve pending time-off (BR-SCH-001); returns bookings to move' })
  async approveTimeOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideTimeOffDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.approveTimeOff(id, dto, actor) };
  }

  @Post('time-offs/:id/reject')
  @RequirePermissions('time_off.approve')
  @HttpCode(HttpStatus.OK)
  async rejectTimeOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideTimeOffDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.rejectTimeOff(id, dto, actor) };
  }

  @Post('time-offs/:id/cancel')
  @RequirePermissions('schedule.write')
  @HttpCode(HttpStatus.OK)
  async cancelTimeOff(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.appointments.cancelTimeOff(id, actor) };
  }

  // ==========================================================================
  // Schedule overrides + impact (ADR-0009 phase 3)
  // ==========================================================================

  @Post('schedule-overrides')
  @RequirePermissions('schedule.write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Close a day/range or change one day of hours (BR-SCH-003/004)' })
  async createOverride(@Body() dto: CreateScheduleOverrideDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.createScheduleOverride(dto, actor) };
  }

  @Get('schedule-overrides')
  @RequirePermissions('schedule.read')
  async listOverrides(@Query() query: ListScheduleOverridesQueryDto) {
    return { data: await this.appointments.listScheduleOverrides(query) };
  }

  @Delete('schedule-overrides/:id')
  @RequirePermissions('schedule.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOverride(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    await this.appointments.deleteScheduleOverride(id, actor);
  }

  @Get('schedule-impact')
  @RequirePermissions('schedule.read')
  @ApiOperation({ summary: 'Upcoming bookings the current calendar no longer allows (BR-SCH-005)' })
  async scheduleImpact(@Query() query: ScheduleImpactQueryDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.scheduleImpact(query, actor) };
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
    // One cancel implementation for both routes (POST /shifts/registrations/
    // :id/cancel is the other): same 24h rule in clinic time, late-cancel
    // audit, booked-appointment guard and calendar lock.
    const isAdmin =
      actor.permissions.includes('shift.cancel') && actor.permissions.includes('shift.approve');
    return {
      data: await this.shiftRegistrations.cancel(id, actor.sub, isAdmin),
    };
  }

  @Post('walk-in')
  @RequirePermissions('appointment.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Walk-in: book from now and check in at once (BR-APPT-032)' })
  async walkIn(@Body() dto: CreateWalkInDto, @User() actor: JwtPayload) {
    return { data: await this.appointments.createWalkIn(dto, actor) };
  }

  // ==========================================================================
  // Nested /:id routes — must be declared AFTER every static sub-route above.
  // ==========================================================================

  @Get(':id/history')
  @RequirePermissions('appointment.read.any', 'appointment.read.own')
  @ApiOperation({ summary: 'Audit trail and reschedules of an appointment (BR-APPT-034)' })
  async history(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.appointments.history(id, actor) };
  }

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

  @Post(':id/confirm')
  @RequirePermissions('appointment.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm appointment (scheduled → confirmed, spec §2.8)' })
  async confirm(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.appointments.confirm(id, actor) };
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
  // A dentist calling in their own next patient (encounter.start) needs to
  // flip this status too, not just front-desk staff (appointment.check_in) —
  // without the OR, the dentist's own "Bắt đầu khám" action always 403'd.
  @RequirePermissions('appointment.check_in', 'encounter.start')
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

  @Post(':id/left')
  @RequirePermissions('appointment.mark_left')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Checked-in patient left before the exam (BR-APPT-033)' })
  async left(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkLeftDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.appointments.markLeft(id, dto, actor) };
  }
}
