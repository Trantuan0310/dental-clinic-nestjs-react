import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { TreatmentPlansService } from './treatment-plans.service';
import {
  AcceptTreatmentPlanDto,
  AddTreatmentPlanItemsDto,
  CreateTreatmentPlanDto,
  TreatmentPlanPatientQueryDto,
  TreatmentPlanReasonDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto';

@ApiTags('Treatment plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly plans: TreatmentPlansService) {}

  @Get()
  @RequirePermissions('treatment_plan.read')
  @ApiOperation({ summary: "A patient's treatment plans, newest first" })
  async list(@Query() q: TreatmentPlanPatientQueryDto, @User() actor: JwtPayload) {
    return { data: await this.plans.listForPatient(q.patientId, actor) };
  }

  @Get('open-items')
  @RequirePermissions('treatment_plan.read')
  @ApiOperation({ summary: 'Planned lines an encounter of this patient may carry out' })
  async openItems(@Query() q: TreatmentPlanPatientQueryDto, @User() actor: JwtPayload) {
    return { data: await this.plans.openItems(q.patientId, actor) };
  }

  @Get(':id')
  @RequirePermissions('treatment_plan.read')
  async get(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.plans.get(id, actor) };
  }

  @Post()
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTreatmentPlanDto, @User() actor: JwtPayload) {
    return { data: await this.plans.create(dto, actor) };
  }

  @Patch(':id')
  @RequirePermissions('treatment_plan.write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentPlanDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.update(id, dto, actor) };
  }

  @Post(':id/propose')
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DRAFT → PROPOSED: the quote is shown to the patient' })
  async propose(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.plans.propose(id, actor) };
  }

  @Post(':id/accept')
  @RequirePermissions('treatment_plan.accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the patient agreed to the plan and its quote' })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptTreatmentPlanDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.accept(id, dto.note, actor) };
  }

  @Post(':id/cancel')
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TreatmentPlanReasonDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.cancel(id, dto.reason, actor) };
  }

  @Post(':id/items')
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add lines to an agreed plan' })
  async addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTreatmentPlanItemsDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.addItems(id, dto, actor) };
  }

  @Post(':id/items/:itemId/skip')
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.OK)
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: TreatmentPlanReasonDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.skipItem(id, itemId, dto.reason, actor) };
  }

  @Post(':id/items/:itemId/unskip')
  @RequirePermissions('treatment_plan.write')
  @HttpCode(HttpStatus.OK)
  async unskip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.plans.unskipItem(id, itemId, actor) };
  }
}
