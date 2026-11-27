import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { PatientHistoryService } from './patient-history.service';

export class RequestHistoryLinkDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;
}

export class CreateReviewDto {
  @ApiProperty({ description: 'reviewKey of the visit on the history page' })
  @IsString()
  @Matches(/^[0-9a-f]{24}$/)
  reviewKey!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@ApiTags('Patient history (staff)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients/:id/history-link')
export class PatientHistoryLinkController {
  constructor(private readonly history: PatientHistoryService) {}

  @Post()
  @RequirePermissions('patient.read')
  @ApiOperation({
    summary: 'Cấp đường dẫn để bệnh nhân tự xem lịch sử khám (gửi kèm email/SMS trong hồ sơ)',
  })
  async issue(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.history.issueForPatient(id, actor) };
  }
}

@ApiTags('Public patient history')
@Controller('public/patient-history')
export class PublicPatientHistoryController {
  constructor(private readonly history: PatientHistoryService) {}

  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Bệnh nhân nhập SĐT; đường dẫn được gửi tới email/SĐT trong hồ sơ, không trả về ở đây',
  })
  async request(@Body() dto: RequestHistoryLinkDto) {
    return { data: await this.history.requestByPhone(dto.phone) };
  }

  @Post(':token/reviews')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Bệnh nhân đánh giá bác sĩ của một lần khám đã xong (mỗi lần khám một lần)' })
  async review(@Param('token') token: string, @Body() dto: CreateReviewDto) {
    return { data: await this.history.review(token, dto.reviewKey, dto.rating, dto.comment) };
  }

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex')
  async view(@Param('token') token: string) {
    return { data: await this.history.view(token) };
  }
}
