import {
  Body,
  Controller,
  Get,
  Header,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { IntakeService } from './intake.service';

@Controller('public/appointment-links')
export class PublicIntakeController {
  constructor(private intake: IntakeService) {}
  @Post(':token/intake')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async submit(@Param('token') token: string, @Body() body: unknown, @Ip() ip?: string) {
    return { data: await this.intake.submit(token, body, ip) };
  }
}

@Controller('appointments/:id/intake')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('patient.medical_history.update', 'patient.update')
export class IntakeController {
  constructor(private intake: IntakeService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async get(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.intake.get(id, actor) };
  }
  @Post('approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.intake.review(id, 'APPROVED', actor) };
  }
  @Post('discard')
  async discard(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.intake.review(id, 'DISCARDED', actor) };
  }
}
