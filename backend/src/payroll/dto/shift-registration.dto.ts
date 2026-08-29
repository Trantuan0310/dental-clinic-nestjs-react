import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShiftRegistrationDto {
  @ApiProperty({
    format: 'uuid',
    required: false,
    description: 'Required for admin creating on behalf; defaults to currentUser for BS',
  })
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiProperty({ example: '2026-08-21' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '18:00', description: 'HH:mm 24h format' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '21:00', description: 'HH:mm 24h format' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxEncounters?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RejectShiftDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ListShiftRegistrationsQueryDto {
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], required: false })
  @IsOptional()
  @IsString()
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @ApiProperty({ example: '2026-08-01', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ example: '2026-08-31', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;
}
