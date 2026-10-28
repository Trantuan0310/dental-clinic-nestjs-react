import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Only unread' })
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: string;

  @ApiPropertyOptional({ description: 'id of the last notification of the previous page' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
