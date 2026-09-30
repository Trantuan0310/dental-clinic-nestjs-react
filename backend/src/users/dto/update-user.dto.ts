import { IsString, IsOptional, IsEnum, IsEmail, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { NormalizeEmail } from '../../common/email.util';

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

  @ApiPropertyOptional({ example: 'bs.an@clinic.vn', description: 'Login email (lowercased)' })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ enum: UserStatus, description: 'User status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
