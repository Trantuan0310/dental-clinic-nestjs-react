import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, JwtPayload } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { MedicalRecordsService } from './medical-records.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  AddAddendumDto,
  CloseEncounterDto,
  CreatePrescriptionDto,
  CreateTreatmentDto,
  SnapshotDentalChartDto,
  StartEncounterDto,
  UpdatePrescriptionDto,
  UpdateTreatmentDto,
  UpsertClinicalNoteDto,
  ListEncountersQueryDto,
} from './dto/medical-record.dto';

@ApiTags('Medical Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly mr: MedicalRecordsService) {}

  @Get('encounters')
  @RequirePermissions('encounter.read.any', 'encounter.read.own')
  @ApiOperation({ summary: 'List encounters (BR-MR-019 row-level for dentist)' })
  async list(@Query() q: ListEncountersQueryDto, @User() actor: JwtPayload) {
    return wrapAsPaginated(
      await this.mr.listEncounters({
        patientId: q.patientId,
        dentistId: q.dentistId,
        from: q.from,
        to: q.to,
        actor,
      }),
    );
  }

  @Post('encounters/start')
  @RequirePermissions('encounter.start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start encounter for appointment (BR-MR-001)' })
  async start(@Body() dto: StartEncounterDto, @User() actor: JwtPayload) {
    if (!dto.appointmentId) {
      throw new BadRequestException('appointmentId required');
    }
    return { data: await this.mr.startEncounterForAppointment(dto.appointmentId, actor) };
  }

  @Get('encounters/:id')
  @RequirePermissions('encounter.read.any', 'encounter.read.own')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.mr.getEncounter(id) };
  }

  @Post('encounters/:id/close')
  @RequirePermissions('encounter.complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Close encounter: status → COMPLETED, lock clinical note, decrement inventory, appointment COMPLETED. Emits encounter.closed.',
  })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseEncounterDto,
    @User() actor: JwtPayload,
  ) {
    const result = await this.mr.closeEncounter(id, dto, actor);
    // NOTE: encounter.closed event is emitted by MedicalRecordsModule's
    // listener bound to encounter.complete; controller does NOT emit here.
    return { data: result };
  }

  @Post('encounters/:id/cancel')
  @RequirePermissions('encounter.cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @User() actor: JwtPayload,
  ) {
    await this.mr.cancelEncounter(id, reason, actor);
    return { data: { cancelled: true } };
  }

  // ------- Clinical Note -------

  @Put('encounters/:id/clinical-note')
  @RequirePermissions('clinical_note.write')
  @ApiOperation({ summary: 'Upsert clinical note (BR-MR-007)' })
  async upsertNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertClinicalNoteDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.upsertClinicalNote(id, dto, actor) };
  }

  @Post('encounters/:id/clinical-note/addendums')
  @RequirePermissions('clinical_note.addendum')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add addendum to clinical note' })
  async addAddendum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAddendumDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.addAddendum(id, dto, actor) };
  }

  // ------- Treatments -------

  @Post('encounters/:id/treatments')
  @RequirePermissions('treatment.write')
  @HttpCode(HttpStatus.CREATED)
  async createTreatment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTreatmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.createTreatment(id, dto, actor) };
  }

  @Patch('encounters/:id/treatments/:tid')
  @RequirePermissions('treatment.write')
  async updateTreatment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tid', ParseUUIDPipe) tid: string,
    @Body() dto: UpdateTreatmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.updateTreatment(id, tid, dto, actor) };
  }

  @Delete('encounters/:id/treatments/:tid')
  @RequirePermissions('treatment.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTreatment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tid', ParseUUIDPipe) tid: string,
    @User() actor: JwtPayload,
  ) {
    await this.mr.deleteTreatment(id, tid, actor);
  }

  // ------- Prescription -------

  @Post('encounters/:id/prescription')
  @RequirePermissions('prescription.write')
  @HttpCode(HttpStatus.CREATED)
  async upsertPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePrescriptionDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.upsertPrescription(id, dto, actor) };
  }

  // Partial-update an existing prescription (header fields only; lines are
  // managed by the POST endpoint to keep a single source of truth for
  // allergy/interaction validation).
  @Patch('prescriptions/:id')
  @RequirePermissions('prescription.write')
  async updatePrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrescriptionDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.updatePrescription(id, dto, actor) };
  }

  // Soft-delete (BR-MR-006: prescriptions are never hard-deleted).
  @Delete('prescriptions/:id')
  @RequirePermissions('prescription.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @User() actor: JwtPayload,
  ) {
    await this.mr.deletePrescription(id, actor);
  }

  // ------- Dental Chart -------

  @Post('encounters/:id/dental-chart/snapshot')
  @RequirePermissions('dental_chart.write')
  @HttpCode(HttpStatus.OK)
  async snapshotChart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SnapshotDentalChartDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.mr.snapshotDentalChart(id, dto, actor) };
  }

  @Get('patients/:patientId/dental-chart/latest')
  @RequirePermissions('dental_chart.read')
  async getLatestChart(@Param('patientId', ParseUUIDPipe) patientId: string) {
    const chart = await this.mr.getLatestDentalChartForPatient(patientId);
    return { data: chart };
  }
}
