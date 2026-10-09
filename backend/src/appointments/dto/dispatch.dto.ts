import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCalendarDate } from '../../common/validators/is-calendar-date';
import { ReasonText } from '../../common/validators/reason-text';

export class QueueListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string;

  @ApiPropertyOptional({ description: 'Clinic date YYYY-MM-DD, defaults to today' })
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}

export class QueueSkipDto {
  @ApiProperty({ example: 'Gọi 2 lần không thấy' })
  @ReasonText(3, 300)
  reason!: string;
}

export class QueueEmergencyDto {
  @ApiProperty({ example: 'Sưng mặt, sốt cao' })
  @ReasonText(5, 300)
  reason!: string;
}

export class QueueTransferDto {
  @ApiProperty()
  @IsUUID()
  dentistId!: string;

  @ApiProperty({ example: 'BS An quá tải, BS Bình đang trống' })
  @ReasonText(5, 300)
  reason!: string;

  @ApiPropertyOptional({
    description: "Confirms the visit may run past the new dentist's hours (A3-02c)",
  })
  @IsOptional()
  @IsBoolean()
  allowOvertime?: boolean;
}

export class ReassignDayDto {
  @ApiProperty()
  @IsUUID()
  fromDentistId!: string;

  @ApiProperty()
  @IsUUID()
  toDentistId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsCalendarDate()
  date!: string;

  @ApiProperty({ example: 'BS An nghỉ ốm' })
  @ReasonText(5, 300)
  reason!: string;

  @ApiPropertyOptional({
    description: "Close the absent dentist's day so nobody books them (default true)",
  })
  @IsOptional()
  @IsBoolean()
  closeFromDentist?: boolean;
}

/** Undo "thay bác sĩ cả ngày": reopen the day, move the untouched visits back. */
export class UndoReassignDayDto {
  @ApiProperty()
  @IsUUID()
  fromDentistId!: string;

  @ApiProperty()
  @IsUUID()
  toDentistId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsCalendarDate()
  date!: string;

  @ApiProperty({ example: 'BS An đã quay lại làm' })
  @ReasonText(5, 300)
  reason!: string;
}
