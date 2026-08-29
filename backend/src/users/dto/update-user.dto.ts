import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING_SETUP = 'PENDING_SETUP',
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A Updated', description: 'Full name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  fullName?: string;

  @ApiPropertyOptional({ enum: UserStatus, description: 'User status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
