import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { MessagingService } from './messaging.service';

class MessageLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

class TestMessageDto {
  @IsString()
  @Matches(/^[\d\s+.()-]{9,20}$/, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;
}

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('status')
  @RequirePermissions('message_log.read')
  @ApiOperation({ summary: 'Which SMS / Zalo channels are on, and what their setup lacks' })
  status() {
    return { data: this.messaging.status() };
  }

  @Get('logs')
  @RequirePermissions('message_log.read')
  async logs(@Query() q: MessageLogQueryDto) {
    return this.messaging.logs(q.page, q.pageSize);
  }

  @Post('test')
  @RequirePermissions('message_log.read')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test message over the channels that are on' })
  async test(@Body() dto: TestMessageDto) {
    return { data: await this.messaging.sendTest(dto.phone) };
  }
}
