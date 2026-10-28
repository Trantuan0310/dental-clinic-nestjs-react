import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/guards/permissions.guard';
import { User } from '../common/decorators/user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Any signed-in user: each count is filtered by the caller's permissions.
  @Get('summary')
  @ApiOperation({ summary: 'What is waiting on the caller (header bell)' })
  async summary(@User() actor: JwtPayload) {
    return { data: await this.notifications.summary(actor) };
  }
}
