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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { RecallsService } from './recalls.service';
import {
  RecallContactDto,
  RecallListQueryDto,
  RecallOptOutDto,
  RecallUnsubscribeDto,
} from './dto/recall.dto';

@ApiTags('Recalls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('recalls')
export class RecallsController {
  constructor(private readonly recalls: RecallsService) {}

  @Get()
  @RequirePermissions('recall.read')
  @ApiOperation({ summary: 'Patients due back for a recall (to call), booked or closed' })
  async list(@Query() q: RecallListQueryDto) {
    return { data: await this.recalls.list(q) };
  }

  @Post(':id/contact')
  @RequirePermissions('recall.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the outcome of a recall call' })
  async contact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecallContactDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.recalls.recordContact(id, dto, actor) };
  }

  @Post(':id/reopen')
  @RequirePermissions('recall.manage')
  @HttpCode(HttpStatus.OK)
  async reopen(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.recalls.reopen(id, actor) };
  }

  @Post('patients/:patientId/opt-out')
  @RequirePermissions('recall.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop or resume recall emails for a patient' })
  async optOut(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: RecallOptOutDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.recalls.setOptOut(patientId, dto.optOut, actor) };
  }
}

@ApiTags('Recalls (public)')
@Controller('public/recalls')
export class PublicRecallsController {
  constructor(private readonly recalls: RecallsService) {}

  @Post('unsubscribe')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The "stop recall emails" link of a recall email' })
  async unsubscribe(@Body() dto: RecallUnsubscribeDto) {
    return { data: await this.recalls.unsubscribe(dto.token) };
  }
}
