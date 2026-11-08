import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { AppointmentLinksService } from './appointment-links.service';
import { AppointmentLinkCancelDto, AppointmentLinkRescheduleDto, ApproveAppointmentLinkRescheduleDto } from './dto/appointment-link.dto';

@ApiTags('Public appointment links')
@Controller('public/appointment-links/:token')
@Throttle({ default: { limit: 15, ttl: 60000 } })
export class PublicAppointmentLinksController {
  constructor(private readonly links: AppointmentLinksService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async get(@Param('token') token: string) {
    return { data: await this.links.get(token) };
  }

  @Get('slots')
  @Header('Cache-Control', 'no-store')
  async slots(@Param('token') token: string, @Query('date') date: string) {
    return { data: await this.links.slots(token, date) };
  }

  @Post('confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async confirm(@Param('token') token: string) {
    return { data: await this.links.confirm(token) };
  }

  @Post('reschedule')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async reschedule(@Param('token') token: string, @Body() dto: AppointmentLinkRescheduleDto) {
    return { data: await this.links.reschedule(token, dto) };
  }

  @Post('cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cancel(@Param('token') token: string, @Body() dto: AppointmentLinkCancelDto) {
    return { data: await this.links.cancel(token, dto) };
  }
}

@ApiTags('Appointment link reschedule requests')
@ApiBearerAuth()
@Controller('appointment-links/reschedule-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentLinkRequestsController {
  constructor(private readonly links: AppointmentLinksService) {}

  @Get()
  @RequirePermissions('appointment.read.any')
  async list(@User() actor: JwtPayload) {
    return { data: await this.links.listRequests(actor) };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('appointment.update')
  async approve(@Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveAppointmentLinkRescheduleDto, @User() actor: JwtPayload) {
    return { data: await this.links.approve(id, dto, actor) };
  }
}
