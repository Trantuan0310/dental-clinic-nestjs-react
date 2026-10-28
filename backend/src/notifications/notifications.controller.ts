import {
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
import { JwtPayload } from '../common/guards/permissions.guard';
import { User } from '../common/decorators/user.decorator';
import { NotificationsService } from './notifications.service';
import { InboxService } from './inbox.service';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';

// Any signed-in user, always their own notifications: no permission needed.
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly inbox: InboxService,
  ) {}

  // Each count is filtered by the caller's permissions.
  @Get('summary')
  @ApiOperation({ summary: 'What is waiting on the caller (header bell)' })
  async summary(@User() actor: JwtPayload) {
    return { data: await this.notifications.summary(actor) };
  }

  @Get()
  @ApiOperation({ summary: "The caller's notifications, newest first (history)" })
  async list(@User() actor: JwtPayload, @Query() q: ListNotificationsQueryDto) {
    const page = await this.inbox.list(actor.sub, {
      unreadOnly: q.unread === 'true',
      cursor: q.cursor,
    });
    return {
      data: page.data,
      pagination: { nextCursor: page.nextCursor, hasMore: !!page.nextCursor },
    };
  }

  @Get('unread-count')
  async unreadCount(@User() actor: JwtPayload) {
    return { data: { count: await this.inbox.unreadCount(actor.sub) } };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@User() actor: JwtPayload) {
    return { data: await this.inbox.markAllRead(actor.sub) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@User() actor: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.inbox.markRead(actor.sub, id);
  }
}
