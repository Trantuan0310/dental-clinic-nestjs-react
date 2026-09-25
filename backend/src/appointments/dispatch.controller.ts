import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { DispatchService } from './dispatch.service';
import {
  QueueEmergencyDto,
  QueueListQueryDto,
  QueueSkipDto,
  QueueTransferDto,
  ReassignDayDto,
} from './dto/dispatch.dto';

/** Dispatch queue (ADR-0009 phase 6). */
@ApiTags('Dispatch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('queue')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  @RequirePermissions('queue.read')
  @ApiOperation({ summary: 'Open queue entries for a date, in dispatch order (BR-DSP-001)' })
  async list(@Query() q: QueueListQueryDto, @User() actor: JwtPayload) {
    return { data: await this.dispatch.list(q, actor) };
  }

  @Post('reassign-day')
  @RequirePermissions('queue.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Move a dentist's bookings on a date to a substitute (BR-DSP-006)" })
  async reassignDay(@Body() dto: ReassignDayDto, @User() actor: JwtPayload) {
    return { data: await this.dispatch.reassignDay(dto, actor) };
  }

  @Post(':id/call')
  @RequirePermissions('queue.call')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Call a waiting or skipped patient (BR-DSP-002)' })
  async call(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.dispatch.call(id, actor) };
  }

  @Post(':id/skip')
  @RequirePermissions('queue.call')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Skip a patient who did not answer (BR-DSP-003)' })
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QueueSkipDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.dispatch.skip(id, dto.reason, actor) };
  }

  @Post(':id/emergency')
  @RequirePermissions('queue.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put a patient first as an emergency (BR-DSP-004)' })
  async emergency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QueueEmergencyDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.dispatch.markEmergency(id, dto.reason, actor) };
  }

  @Post(':id/transfer')
  @RequirePermissions('queue.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a waiting patient to another dentist (BR-DSP-005)' })
  async transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QueueTransferDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.dispatch.transfer(id, dto, actor) };
  }
}
