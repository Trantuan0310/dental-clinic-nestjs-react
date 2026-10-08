import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { assertClinicWide } from '../common/row-scope';
import {
  AcceptBookingProposalDto,
  BookingRequestMessageDto,
  BookingRequestNoteDto,
  ConfirmBookingRequestDto,
  CreatePublicBookingRequestDto,
  DeclineBookingProposalDto,
  ListBookingRequestsDto,
  PendingInRangeQueryDto,
  ProposeBookingTimeDto,
  PublicBookingNoteDto,
  PublicSlotsQueryDto,
  UpdatePublicBookingDetailsDto,
} from './dto/booking.dto';
import { BookingService } from './booking.service';

@ApiTags('Public booking')
@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly booking: BookingService) {}
  @Get('options')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async options() {
    return { data: await this.booking.options() };
  }
  @Get('prices')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async prices() {
    return { data: await this.booking.priceList() };
  }
  @Get('slots')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async slots(@Query() q: PublicSlotsQueryDto) {
    return { data: await this.booking.slots(q) };
  }
  @Post('requests')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePublicBookingRequestDto) {
    return { data: await this.booking.createPublic(dto) };
  }
  // Phone-only lookup (status only, no reference code): the phone goes in a
  // header, not the URL, so it stays out of access logs.
  @Get('lookup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async lookup(@Headers('x-booking-phone') phone?: string) {
    return { data: await this.booking.lookupByPhone(phone) };
  }
  // Access is the token from the confirmation link (X-Booking-Access-Token)
  // or the phone the request was made with (X-Booking-Phone), which only
  // shows the status; every change below needs the token. See
  // BookingService.verify().
  @Get('requests/:reference')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async status(
    @Param('reference') ref: string,
    @Headers('x-booking-access-token') token?: string,
    @Headers('x-booking-phone') phone?: string,
  ) {
    return { data: await this.booking.publicStatus(ref, { token, phone }) };
  }
  @Post('requests/:reference/accept-proposal')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async accept(
    @Param('reference') ref: string,
    @Body() dto: AcceptBookingProposalDto,
    @Headers('x-booking-access-token') token?: string,
    @Headers('x-booking-phone') phone?: string,
  ) {
    return { data: await this.booking.acceptProposal(ref, { token, phone }, dto ?? {}) };
  }
  // "Không đồng ý giờ này": back to the front desk for another time.
  @Post('requests/:reference/decline-proposal')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async declineProposal(
    @Param('reference') ref: string,
    @Body() dto: DeclineBookingProposalDto,
    @Headers('x-booking-access-token') token?: string,
    @Headers('x-booking-phone') phone?: string,
  ) {
    return { data: await this.booking.declineProposal(ref, { token, phone }, dto ?? {}) };
  }
  @Put('requests/:reference/details')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async details(
    @Param('reference') ref: string,
    @Body() dto: UpdatePublicBookingDetailsDto,
    @Headers('x-booking-access-token') token?: string,
    @Headers('x-booking-phone') phone?: string,
  ) {
    return { data: await this.booking.updateDetails(ref, { token, phone }, dto) };
  }
  @Post('requests/:reference/withdraw')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async withdraw(
    @Param('reference') ref: string,
    @Body() dto: PublicBookingNoteDto,
    @Headers('x-booking-access-token') token?: string,
    @Headers('x-booking-phone') phone?: string,
  ) {
    return { data: await this.booking.withdraw(ref, { token, phone }, dto ?? {}) };
  }
}

@ApiTags('Booking requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('booking-requests')
export class BookingRequestsController {
  constructor(private readonly booking: BookingService) {}
  @Get()
  @RequirePermissions('booking_request.read')
  async list(@Query() q: ListBookingRequestsDto) {
    return { data: await this.booking.listForStaff(q) };
  }
  // Before ':id', which would otherwise try to parse "pending-count" as a UUID.
  @Get('pending-count')
  @RequirePermissions('booking_request.read')
  async pendingCount() {
    return { data: await this.booking.pendingCount() };
  }
  // Open requests on a dentist's days, each saying whether it can still be
  // confirmed as it stands (for the schedule-change impact lists).
  @Get('pending-in-range')
  @RequirePermissions('booking_request.read')
  async pendingInRange(@Query() q: PendingInRangeQueryDto) {
    return { data: await this.booking.pendingInRange(q) };
  }
  @Get(':id/dentists')
  @RequirePermissions('booking_request.read')
  async dentists(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.booking.dentistOptions(id) };
  }
  @Get(':id/patient-matches')
  @RequirePermissions('booking_request.read')
  async matches(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    // Lists existing patient records: clinic-wide patient scope only (A6-19).
    assertClinicWide(actor, 'patient');
    return { data: await this.booking.patientMatches(id) };
  }
  @Get(':id')
  @RequirePermissions('booking_request.read')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.booking.getForStaff(id) };
  }
  @Post(':id/propose')
  @RequirePermissions('booking_request.manage')
  async propose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeBookingTimeDto,
    @User() actor: JwtPayload,
  ) {
    return this.booking.propose(id, dto, actor);
  }
  @Post(':id/need-information')
  @RequirePermissions('booking_request.manage')
  async needInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingRequestMessageDto,
    @User() actor: JwtPayload,
  ) {
    return this.booking.requestInformation(id, dto, actor);
  }
  // The patient answered by phone instead of on the status page.
  @Post(':id/information-received')
  @RequirePermissions('booking_request.manage')
  @HttpCode(HttpStatus.OK)
  async informationReceived(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingRequestNoteDto,
    @User() actor: JwtPayload,
  ) {
    return this.booking.markInformationReceived(id, dto, actor);
  }
  @Post(':id/accepted-by-phone')
  @RequirePermissions('booking_request.manage')
  @HttpCode(HttpStatus.OK)
  async acceptedByPhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingRequestNoteDto,
    @User() actor: JwtPayload,
  ) {
    return this.booking.markProposalAcceptedByPhone(id, dto, actor);
  }
  @Post(':id/decline')
  @RequirePermissions('booking_request.manage')
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingRequestMessageDto,
    @User() actor: JwtPayload,
  ) {
    return this.booking.decline(id, dto, actor);
  }
  @Post(':id/confirm')
  @RequirePermissions('booking_request.manage')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmBookingRequestDto,
    @User() actor: JwtPayload,
  ) {
    // Picks or creates a patient record and books any dentist's calendar.
    assertClinicWide(actor, 'patient', 'appointment');
    return this.booking.confirm(id, actor, {
      patientId: body?.patientId,
      createNewPatient: body?.createNewPatient,
    });
  }
}
