import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class NoteDraftDto {
  @ApiProperty({ description: 'Phiên khám đang mở của bác sĩ' })
  @IsUUID()
  encounterId!: string;

  @ApiProperty({ description: 'Ghi nhanh của bác sĩ', minLength: 3, maxLength: 2000 })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  text!: string;
}

export const MESSAGE_KINDS = ['appointment_reminder', 'recall_reminder', 'reply'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export class MessageDraftDto {
  @ApiProperty({ enum: MESSAGE_KINDS })
  @IsIn(MESSAGE_KINDS)
  kind!: MessageKind;

  @ApiPropertyOptional({ description: 'Bắt buộc khi kind = appointment_reminder' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi kind = recall_reminder' })
  @IsOptional()
  @IsUUID()
  recallId?: string;

  @ApiPropertyOptional({ description: 'Tin nhắn của khách, bắt buộc khi kind = reply' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  customerMessage?: string;

  @ApiPropertyOptional({ description: 'Ý lễ tân muốn thêm vào tin' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  staffNote?: string;
}

export class ReportCommentaryQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  refresh?: boolean;
}
