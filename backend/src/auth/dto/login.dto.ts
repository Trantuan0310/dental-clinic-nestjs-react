import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password-policy';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from '../../common/email.util';

export class LoginDto {
  @ApiProperty({ example: 'admin@clinic.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  // No minimum here: a too-short password is just a wrong password and gets
  // the same answer as any other, the rule is enforced where one is chosen.
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
