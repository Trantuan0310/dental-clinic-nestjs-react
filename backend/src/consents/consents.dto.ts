import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordDeskConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  purpose!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  version!: string;
}

export class ConsentSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ConsentLedgerQueryDto extends ConsentSearchDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  offset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ConsentNoticesQueryDto {
  @IsOptional()
  @IsIn(['vi', 'en'])
  language?: 'vi' | 'en';
}
