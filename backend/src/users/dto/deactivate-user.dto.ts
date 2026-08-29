import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeactivateUserDto {
  @ApiPropertyOptional({ example: 'Resigned', description: 'Reason for deactivation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
