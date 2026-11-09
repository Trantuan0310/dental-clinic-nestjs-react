import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { getConsentNotices } from './consent-record';
import {
  ConsentLedgerQueryDto,
  ConsentNoticesQueryDto,
  ConsentSearchDto,
  RecordDeskConsentDto,
} from './consents.dto';
import { ConsentsService } from './consents.service';

@ApiTags('Patient consents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients/:id/consents')
export class PatientConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  @RequirePermissions('consent.read')
  async list(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.consents.listForPatient(id, actor) };
  }

  @Post()
  @RequirePermissions('consent.manage')
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDeskConsentDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.consents.recordAtDesk(id, dto, actor, req.ip) };
  }

  @Post(':recordId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('consent.manage')
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.consents.withdraw(id, recordId, actor) };
  }
}

@ApiTags('Consent ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('consent.export')
@Controller('admin/consents')
export class AdminConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  async list(@Query() query: ConsentLedgerQueryDto, @User() actor: JwtPayload) {
    return this.consents.adminList(query, actor);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="consents.csv"')
  async export(@Query() query: ConsentSearchDto, @User() actor: JwtPayload) {
    return this.consents.exportCsv(query, actor);
  }
}

@ApiTags('Public consent notices')
@Controller('public/consent-notices')
export class PublicConsentNoticesController {
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  get(@Query() query: ConsentNoticesQueryDto) {
    return { data: getConsentNotices(query.language) };
  }
}
