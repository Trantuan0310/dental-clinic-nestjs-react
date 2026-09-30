import { ArrayMinSize, IsOptional, IsString, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một vai trò' })
  // Ids are UUID v7 (uuid_generate_v7), so accept any version.
  @IsUUID('all', { each: true })
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
