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
import {
  BookingRequestMessageDto,
  ConfirmBookingRequestDto,
  CreatePublicBookingRequestDto,
  ListBookingRequestsDto,
  ProposeBookingTimeDto,
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
  @Get('requests/:reference')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async status(@Param('reference') ref: string, @Headers('x-booking-access-token') token?: string) {
    return { data: await this.booking.publicStatus(ref, token) };
  }
  @Post('requests/:reference/accept-proposal')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async accept(@Param('reference') ref: string, @Headers('x-booking-access-token') token?: string) {
    return { data: await this.booking.acceptProposal(ref, token) };
  }
  @Put('requests/:reference/details')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async details(
    @Param('reference') ref: string,
    @Headers('x-booking-access-token') token: string | undefined,
    @Body() dto: UpdatePublicBookingDetailsDto,
  ) {
    return { data: await this.booking.updateDetails(ref, token, dto) };
  }
  @Post('requests/:reference/withdraw')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async withdraw(
    @Param('reference') ref: string,
    @Headers('x-booking-access-token') token?: string,
  ) {
    return { data: await this.booking.withdraw(ref, token) };
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
  @Get(':id/patient-matches')
  @RequirePermissions('booking_request.read')
  async matches(@Param('id', ParseUUIDPipe) id: string) {
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
    return this.booking.confirm(id, actor, body?.patientId);
  }
}
