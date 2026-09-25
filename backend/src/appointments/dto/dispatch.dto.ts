import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueueListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ description: 'Clinic date YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class QueueSkipDto {
  @ApiProperty({ example: 'Gọi 2 lần không thấy' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class QueueEmergencyDto {
  @ApiProperty({ example: 'Sưng mặt, sốt cao' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class QueueTransferDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ example: 'BS An quá tải, BS Bình đang trống' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class ReassignDayDto {
  @ApiProperty()
  @IsUUID()
  fromDentistId!: string;

  @ApiProperty()
  @IsUUID()
  toDentistId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: 'BS An nghỉ ốm' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}
