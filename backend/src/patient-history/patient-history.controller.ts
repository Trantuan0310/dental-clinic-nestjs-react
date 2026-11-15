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
import { IsString, MaxLength, MinLength } from 'class-validator';
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

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex')
  async view(@Param('token') token: string) {
    return { data: await this.history.view(token) };
  }
}
