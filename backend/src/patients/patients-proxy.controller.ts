import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtPayload } from '../common/guards/permissions.guard';

/**
 * Cross-module proxy controller (BR-PT-022).
 *
 * Mounted at /patients/:id/{encounters,invoices,dental-chart} but lives in
 * the Patients module. Each endpoint inspects the *target* module's
 * permission code (NOT patient.*), enforces its own row-level filter, and
 * records `proxy.{module}.read` audit actions.
 *
 * Implementation note: this controller talks directly to Prisma rather
 * than HTTP-forwarding to Billing/MedicalRecords. Both approaches satisfy
 * BR-PT-022; direct DB access avoids the extra round-trip and lets us
 * enforce row-level cleanly. The audit action makes the proxy call
 * discoverable in compliance reviews.
 */
@ApiTags('Patients Proxy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients/:id')
export class PatientsProxyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('encounters')
  @RequirePermissions('encounter.read.any', 'encounter.read.own', 'encounter.read.basic')
  @ApiOperation({
    summary: 'Proxy — list encounters for patient (BR-PT-022; uses Medical Records permissions)',
  })
  async patientEncounters(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient || patient.deletedAt) {
      throw new ForbiddenException('Patient not found or deleted');
    }

    // Receptionist (encounter.read.basic) → stripped-down payload per BR-MR-022
    if (
      actor.permissions.includes('encounter.read.basic') &&
      !actor.permissions.includes('encounter.read.any')
    ) {
      const rows = await this.prisma.encounter.findMany({
        where: { patientId: id },
        orderBy: { startedAt: 'desc' },
        include: { dentist: { select: { fullName: true } } },
      });
      await this.audit.log({
        action: 'proxy.medical_records.read',
        actorUserId: actor.sub,
        targetType: 'patient',
        targetId: id,
        metadata: { kind: 'encounters-basic', count: rows.length },
      });
      return {
        data: rows.map(e => ({
          id: e.id,
          startedAt: e.startedAt,
          closedAt: e.closedAt,
          status: e.status,
          dentistName: e.dentist.fullName,
        })),
      };
    }

    // Admin (`encounter.read.any`) → full data
    // Dentist (`encounter.read.own`) → only encounters owned by the actor
    const where = actor.permissions.includes('encounter.read.any')
      ? { patientId: id }
      : { patientId: id, dentistId: actor.sub };

    const rows = await this.prisma.encounter.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        dentist: { select: { id: true, fullName: true } },
        appointment: { select: { id: true, startAt: true, status: true } },
      },
    });

    await this.audit.log({
      action: 'proxy.medical_records.read',
      actorUserId: actor.sub,
      targetType: 'patient',
      targetId: id,
      metadata: { kind: 'encounters-full', count: rows.length },
    });

    // Flatten dentist.fullName → dentistName to match the basic-payload
    // branch above and the frontend's EncounterListItem type, which
    // declares dentistName as a required top-level field.
    return { data: rows.map(e => ({ ...e, dentistName: e.dentist.fullName })) };
  }

  @Get('dental-chart')
  @RequirePermissions('dental_chart.read')
  @ApiOperation({
    summary: 'Proxy — dental chart for patient (uses Dental Chart permission)',
  })
  async patientDentalChart(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient || patient.deletedAt) {
      throw new ForbiddenException('Patient not found or deleted');
    }

    const lastEncounter = await this.prisma.encounter.findFirst({
      where: { patientId: id, dentalChart: { isNot: null } },
      orderBy: { startedAt: 'desc' },
      include: { dentalChart: true },
    });

    if (!lastEncounter || !lastEncounter.dentalChart) {
      throw new ForbiddenException('No dental chart snapshot yet for this patient');
    }

    // Dentist: only own encounters
    if (
      !actor.permissions.includes('dental_chart.read') ||
      (actor.permissions.includes('dental_chart.read') &&
        !actor.permissions.includes('encounter.read.any') &&
        !actor.permissions.includes('patient.delete') &&
        lastEncounter.dentistId !== actor.sub)
    ) {
      throw new ForbiddenException('Dental chart not visible');
    }

    await this.audit.log({
      action: 'proxy.medical_records.read',
      actorUserId: actor.sub,
      targetType: 'patient',
      targetId: id,
      metadata: { kind: 'dental-chart', encounterId: lastEncounter.id },
    });

    return { data: lastEncounter.dentalChart };
  }

  @Get('invoices')
  @RequirePermissions('invoice.read.any', 'invoice.read.own', 'invoice.read')
  @ApiOperation({
    summary:
      'Proxy — invoices for patient (uses Billing permission, BR-BILL-003 dentist row-level)',
  })
  async patientInvoices(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient || patient.deletedAt) {
      throw new ForbiddenException('Patient not found or deleted');
    }

    // Dentist row-level: BR-BILL-003 → only invoices linked to encounter they own
    if (
      !actor.permissions.includes('invoice.read.any') &&
      actor.permissions.includes('invoice.read.own')
    ) {
      const rows = await this.prisma.invoice.findMany({
        where: {
          patientId: id,
          deletedAt: null,
          encounter: { dentistId: actor.sub },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, code: true, fullName: true } },
          encounter: { select: { id: true, dentist: { select: { fullName: true } } } },
        },
      });
      await this.audit.log({
        action: 'proxy.billing.read',
        actorUserId: actor.sub,
        targetType: 'patient',
        targetId: id,
        metadata: { kind: 'invoices-own', count: rows.length },
      });
      return { data: rows };
    }

    // Admin / Receptionist → all
    const rows = await this.prisma.invoice.findMany({
      where: { patientId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, code: true, fullName: true } },
        encounter: { select: { id: true, dentist: { select: { fullName: true } } } },
      },
    });

    await this.audit.log({
      action: 'proxy.billing.read',
      actorUserId: actor.sub,
      targetType: 'patient',
      targetId: id,
      metadata: { kind: 'invoices-any', count: rows.length },
    });

    return { data: rows };
  }
}
