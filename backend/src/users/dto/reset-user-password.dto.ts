import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ResetUserPasswordDto {
  @ApiPropertyOptional({ default: true, description: 'Send password via email' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  sendEmail?: boolean = true;
}
