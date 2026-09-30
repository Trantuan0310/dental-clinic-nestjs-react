import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from '../../common/email.util';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@clinic.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email!: string;
}
