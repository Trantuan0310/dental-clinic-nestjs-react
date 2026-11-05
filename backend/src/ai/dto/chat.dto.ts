import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatTurn {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ maxLength: 1500 })
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  content!: string;
}

export class ChatDto {
  @ApiProperty({ type: [ChatTurn], description: 'Cuộc trò chuyện, tin cuối là của người dùng' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatTurn)
  messages!: ChatTurn[];

  @ApiPropertyOptional({ description: 'Mã ref → id bệnh nhân đã gặp trong cuộc trò chuyện' })
  @IsOptional()
  @IsObject()
  refs?: Record<string, string>;
}

export class CreateAppointmentActionDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ example: '2026-11-06T09:00:00+07:00' })
  @IsString()
  @MaxLength(40)
  startAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
