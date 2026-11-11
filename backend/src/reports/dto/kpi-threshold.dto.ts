import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { SCORECARD_TARGETS, ScorecardMetric } from '../practice-metrics';

export class KpiThresholdDto {
  @IsIn(Object.keys(SCORECARD_TARGETS))
  key!: ScorecardMetric['key'];

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  target!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  okAt!: number;
}

export class UpdateKpiThresholdsDto {
  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => KpiThresholdDto)
  thresholds!: KpiThresholdDto[];
}
