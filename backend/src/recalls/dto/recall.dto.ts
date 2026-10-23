import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const RECALL_LIST_SCOPES = ['due', 'booked', 'closed'] as const;
export type RecallListScope = (typeof RECALL_LIST_SCOPES)[number];

export class RecallListQueryDto {
  @ApiPropertyOptional({
    enum: RECALL_LIST_SCOPES,
    description:
      'due: to call now (due within `days`, or a call-back date reached); booked: marked booked; closed: dismissed or done',
  })
  @IsOptional()
  @IsIn(RECALL_LIST_SCOPES)
  scope?: RecallListScope;

  @ApiPropertyOptional({
    default: 14,
    description: 'due scope: also list recalls due within this many days',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  days?: number;

  @ApiPropertyOptional({ description: 'Patient name, code or phone' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export const RECALL_CONTACT_RESULTS = ['BOOKED', 'POSTPONED', 'UNREACHABLE', 'DISMISSED'] as const;
export type RecallContactResult = (typeof RECALL_CONTACT_RESULTS)[number];

export class RecallContactDto {
  @ApiProperty({ enum: RECALL_CONTACT_RESULTS })
  @IsIn(RECALL_CONTACT_RESULTS)
  result!: RecallContactResult;

  @ApiPropertyOptional({ description: 'POSTPONED: call again on this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  postponedUntil?: string;

  @ApiPropertyOptional({ description: 'Required for DISMISSED (≥ 3 characters)' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RecallOptOutDto {
  @ApiProperty({ description: 'true: no recall emails; false: send them again' })
  @IsBoolean()
  optOut!: boolean;
}

export class RecallUnsubscribeDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;
}
