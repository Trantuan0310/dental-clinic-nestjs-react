import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtPayload } from '../common/guards/permissions.guard';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  LookupPatientDto,
  ListPatientsQueryDto,
  MergePatientsDto,
  SoftDeletePatientDto,
  UpdatePatientDto,
  OverrideDobDto,
  PatientIdentifierInputDto,
} from './dto/patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('lookup')
  @RequirePermissions('patient.read')
  @ApiOperation({ summary: 'Patient lookup + duplicate detection (BR-PT-007)' })
  @ApiResponse({ status: 200, description: 'List of matching patients (paginated)' })
  async lookup(@Query() q: LookupPatientDto, @User() actor: JwtPayload) {
    return { data: await this.patients.lookup(q, actor) };
  }

  @Get()
  @RequirePermissions('patient.read')
  @ApiOperation({ summary: 'List patients (BR-PT-014 row-level for dentist)' })
  @ApiResponse({ status: 200, description: 'Paginated list of patients' })
  async list(@Query() q: ListPatientsQueryDto, @User() actor: JwtPayload) {
    return this.patients.list(q, actor);
  }

  @Post()
  @RequirePermissions('patient.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create patient (BR-PT-001 → BR-PT-007)' })
  async create(@Body() dto: CreatePatientDto, @User() actor: JwtPayload) {
    const p = await this.patients.create(dto, actor);
    return { data: { id: p.id, code: p.code, fullName: p.fullName, createdAt: p.createdAt } };
  }

  @Get(':id')
  @RequirePermissions('patient.read')
  @ApiOperation({ summary: 'Patient detail (BR-PT-021 summary masking)' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.patients.getDetailWithSummary(id, actor) };
  }

  @Patch(':id')
  @RequirePermissions('patient.update')
  @ApiOperation({ summary: 'Update patient (BR-PT-009 phone history, BR-PT-016 code locked)' })
  @ApiResponse({ status: 200, description: 'Patient updated' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.patients.update(id, dto, actor) };
  }

  @Patch(':id/override-dob')
  @RequirePermissions('patient.update')
  @ApiOperation({ summary: 'Admin override DOB (BR-PT-017) when patient has encounters' })
  async overrideDob(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideDobDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.patients.overrideDob(id, dto, actor) };
  }

  @Delete(':id')
  @RequirePermissions('patient.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete patient (BR-PT-010)' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SoftDeletePatientDto,
    @User() actor: JwtPayload,
  ) {
    await this.patients.softDelete(id, dto, actor);
  }

  @Post(':id/restore')
  @RequirePermissions('patient.restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore soft-deleted patient' })
  async restore(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.patients.restore(id, actor) };
  }

  @Get(':id/phones')
  @RequirePermissions('patient.read')
  @ApiOperation({ summary: 'Phone history for patient' })
  async phoneHistory(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.patients.getPhoneHistory(id) };
  }

  @Post(':id/identifiers')
  @RequirePermissions('patient.identifier.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add CCCD/CMND/Passport identifier' })
  async addIdentifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatientIdentifierInputDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.patients.addIdentifier(id, dto, actor) };
  }

  @Delete(':id/identifiers/:identId')
  @RequirePermissions('patient.identifier.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove identifier' })
  async removeIdentifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('identId', ParseUUIDPipe) identId: string,
    @User() actor: JwtPayload,
  ) {
    await this.patients.removeIdentifier(id, identId, actor);
  }

  @Post('merge')
  @RequirePermissions('patient.merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge duplicate patients (BR-PT-019 / BR-PT-020)' })
  @ApiResponse({ status: 200, description: 'Patients merged' })
  @ApiResponse({ status: 409, description: 'Merge conflict' })
  async merge(@Body() dto: MergePatientsDto, @User() actor: JwtPayload) {
    return { data: await this.patients.merge(dto, actor) };
  }
}
