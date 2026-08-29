import { IsOptional, IsString, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}

export class DeactivateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResetUserPasswordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
