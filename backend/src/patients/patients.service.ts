import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { PaginatedResult, PaginationSchema } from '../common/dto/pagination.dto';
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
import {
  DobLockedException,
  IdentifierAlreadyExistsException,
  PatientCannotDeleteException,
  PatientCodeConflictException,
  PatientContactRequiredException,
  PatientMergeInvalidException,
  PatientNotFoundException,
} from './domain/exceptions';
import {
  isMinor,
  isValidDob,
  isValidEmail,
  isValidIdentifierValue,
  isValidVnPhone,
  readJsonStringArray,
} from './domain/patient-rules';

/**
 * PatientsService — root aggregate for patient demographics.
 *
 * Pure module isolation (BD-0003): no inbound events. Cross-module
 * references (encounters, invoices) live in CrossModuleProxyController so
 * row-level + permission enforcement happens there.
 */
@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================================
  // Code generator (BR-PT-001)
  // ============================================================================

  private async generatePatientCode(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('patient_code_seq')
    `;
    const next = rows[0].nextval;
    const padded = String(Number(next)).padStart(5, '0');
    return `PAT-${year}-${padded}`;
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async create(dto: CreatePatientDto, actor: JwtPayload) {
    const dob = new Date(dto.dob);
    if (!isValidDob(dob)) {
      throw new PatientContactRequiredException('Ngày sinh không hợp lệ');
    }
    if (dto.primaryPhone !== undefined && dto.primaryPhone !== null) {
      if (!isValidVnPhone(dto.primaryPhone)) {
        throw new PatientContactRequiredException('Số điện thoại không hợp lệ');
      }
    }
    if (dto.email && !isValidEmail(dto.email)) {
      throw new PatientContactRequiredException('Email không hợp lệ');
    }

    // BR-PT-012 + BR-PT-013
    const hasPrimary = !!dto.primaryPhone;
    const hasContactPerson = !!dto.contactPersonPhone && !!dto.contactPersonName;
    if (!hasPrimary && !hasContactPerson) {
      throw new PatientContactRequiredException(
        'Cần ít nhất một số liên lạc (số điện thoại chính hoặc người liên hệ)',
      );
    }
    if (isMinor(dob) && !hasContactPerson) {
      throw new PatientContactRequiredException(
        'Bệnh nhân nhỏ hơn 12 tuổi cần thông tin người liên hệ',
      );
    }

    for (const ident of dto.identifiers ?? []) {
      if (!isValidIdentifierValue(ident.type, ident.value)) {
        throw new PatientContactRequiredException(
          `Giấy tờ ${ident.type} không hợp lệ: ${ident.value}`,
        );
      }
    }

    const code = await this.generatePatientCode();

    const created = await this.prisma.$transaction(async tx => {
      const patient = await tx.patient.create({
        data: {
          code,
          fullName: dto.fullName.trim(),
          dob,
          gender: dto.gender,
          primaryPhone: dto.primaryPhone ?? null,
          email: dto.email ? dto.email.toLowerCase() : null,
          address: dto.address ?? null,
          occupation: dto.occupation ?? null,
          allergies: (dto.allergies ?? []) as unknown as Prisma.InputJsonValue,
          chronicDiseases: (dto.chronicDiseases ?? []) as unknown as Prisma.InputJsonValue,
          currentMedications: (dto.currentMedications ?? []) as unknown as Prisma.InputJsonValue,
          contactPersonName: dto.contactPersonName ?? null,
          contactPersonPhone: dto.contactPersonPhone ?? null,
          notes: dto.notes ?? null,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
      });

      for (const ident of dto.identifiers ?? []) {
        const existing = await tx.patientIdentifier.findFirst({
          where: { type: ident.type, value: ident.value, deletedAt: null },
          select: { id: true, patientId: true },
        });
        if (existing && existing.patientId !== patient.id) {
          throw new IdentifierAlreadyExistsException(ident.type, ident.value);
        }
        try {
          await tx.patientIdentifier.create({
            data: {
              patientId: patient.id,
              type: ident.type,
              value: ident.value,
              issuedAt: ident.issuedAt ? new Date(ident.issuedAt) : null,
              issuedBy: ident.issuedBy ?? null,
              createdBy: actor.sub,
            },
          });
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          if (code === 'P2002') {
            throw new IdentifierAlreadyExistsException(ident.type, ident.value);
          }
          throw err;
        }
      }

      return patient;
    });

    await this.audit.log({
      action: 'PATIENT_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: created.id,
      metadata: { code: created.code, fullName: created.fullName },
    });

    return created;
  }

  async update(id: string, dto: UpdatePatientDto, actor: JwtPayload) {
    const current = await this.prisma.patient.findUnique({ where: { id } });
    if (!current) throw new PatientNotFoundException(id);

    // BR-PT-016: code immutable
    if ('code' in (dto as Record<string, unknown>)) {
      throw new PatientContactRequiredException('Không thể thay đổi mã bệnh nhân');
    }

    if (dto.dob) {
      const newDob = new Date(dto.dob);
      if (!isValidDob(newDob)) {
        throw new PatientContactRequiredException('Ngày sinh không hợp lệ');
      }
      const encounterCount = await this.prisma.encounter.count({
        where: { patientId: id },
      });
      if (encounterCount > 0) {
        throw new DobLockedException();
      }
    }

    if (dto.email && !isValidEmail(dto.email)) {
      throw new PatientContactRequiredException('Email không hợp lệ');
    }
    if (
      dto.primaryPhone !== undefined &&
      dto.primaryPhone !== null &&
      !isValidVnPhone(dto.primaryPhone)
    ) {
      throw new PatientContactRequiredException('Số điện thoại không hợp lệ');
    }

    const phoneChanged =
      dto.primaryPhone !== undefined && dto.primaryPhone !== current.primaryPhone;

    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.patient.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
          ...(dto.dob !== undefined && { dob: new Date(dto.dob) }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.primaryPhone !== undefined && { primaryPhone: dto.primaryPhone ?? null }),
          ...(dto.email !== undefined && { email: dto.email ? dto.email.toLowerCase() : null }),
          ...(dto.address !== undefined && { address: dto.address ?? null }),
          ...(dto.occupation !== undefined && { occupation: dto.occupation ?? null }),
          ...(dto.allergies !== undefined && {
            allergies: dto.allergies as unknown as Prisma.InputJsonValue,
          }),
          ...(dto.chronicDiseases !== undefined && {
            chronicDiseases: dto.chronicDiseases as unknown as Prisma.InputJsonValue,
          }),
          ...(dto.currentMedications !== undefined && {
            currentMedications: dto.currentMedications as unknown as Prisma.InputJsonValue,
          }),
          ...(dto.contactPersonName !== undefined && {
            contactPersonName: dto.contactPersonName ?? null,
          }),
          ...(dto.contactPersonPhone !== undefined && {
            contactPersonPhone: dto.contactPersonPhone ?? null,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
          updatedBy: actor.sub,
        },
      });

      // BR-PT-009: phone history when phone changes
      if (phoneChanged) {
        await tx.patientPhoneHistory.create({
          data: {
            patientId: id,
            oldPhone: current.primaryPhone ?? null,
            newPhone: dto.primaryPhone ?? '',
            changedBy: actor.sub,
          },
        });
      }

      return u;
    });

    await this.audit.log({
      action: 'PATIENT_UPDATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
      metadata: {
        fields: Object.keys(dto),
        phoneChanged,
      },
    });

    return updated;
  }

  /**
   * Admin-only DOB override (BR-PT-017). Records audit with reason.
   */
  async overrideDob(id: string, dto: OverrideDobDto, actor: JwtPayload) {
    const current = await this.prisma.patient.findUnique({ where: { id } });
    if (!current) throw new PatientNotFoundException(id);

    const newDob = new Date(dto.dob);
    if (!isValidDob(newDob)) {
      throw new PatientContactRequiredException('Ngày sinh không hợp lệ');
    }
    const updated = await this.prisma.patient.update({
      where: { id },
      data: { dob: newDob, updatedBy: actor.sub },
    });

    await this.audit.log({
      action: 'PATIENT_DOB_OVERRIDDEN',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
      metadata: { oldDob: current.dob, newDob, reason: dto.reason },
    });

    return updated;
  }

  // ============================================================================
  // Soft-delete + restore
  // ============================================================================

  async softDelete(id: string, dto: SoftDeletePatientDto, actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new PatientNotFoundException(id);

    // BR-PT-010: block when future appointments or outstanding invoices exist
    const [futureAppointments, outstandingInvoices] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          patientId: id,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] },
          startAt: { gte: new Date() },
          deletedAt: null,
        },
      }),
      this.prisma.invoice.count({
        where: {
          patientId: id,
          status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] },
          deletedAt: null,
        },
      }),
    ]);

    if (futureAppointments > 0 || outstandingInvoices > 0) {
      throw new PatientCannotDeleteException(
        `Patient has ${futureAppointments} future appointments and ${outstandingInvoices} outstanding invoices`,
        [
          ...(futureAppointments > 0
            ? [{ field: 'appointments', code: 'future_appointment', count: futureAppointments }]
            : []),
          ...(outstandingInvoices > 0
            ? [{ field: 'invoices', code: 'outstanding_invoice', count: outstandingInvoices }]
            : []),
        ],
      );
    }

    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.sub, updatedBy: actor.sub },
    });

    await this.audit.log({
      action: 'PATIENT_DELETED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
      metadata: { reason: dto.reason },
    });
  }

  async restore(id: string, actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new PatientNotFoundException(id);

    // BR-PT-016: if another active patient already uses this code, fail.
    const conflict = await this.prisma.patient.findFirst({
      where: { code: patient.code, deletedAt: null, NOT: { id } },
      select: { id: true },
    });
    if (conflict) {
      throw new PatientCodeConflictException(patient.code);
    }

    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null, updatedBy: actor.sub },
    });

    await this.audit.log({
      action: 'PATIENT_RESTORED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
    });

    return this.getById(id);
  }

  // ============================================================================
  // Read
  // ============================================================================

  async getById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        identifiers: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        encounters: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            startedAt: true,
            dentist: { select: { fullName: true } },
          },
        },
      },
    });
    if (!patient) throw new PatientNotFoundException(id);
    const base = this.toPatientDetail(patient);
    return {
      ...base,
      lastVisitAt: patient.encounters[0]?.startedAt ?? null,
      lastVisitBy: patient.encounters[0]?.dentist?.fullName ?? null,
    };
  }

  /**
   * Patient detail with summary mask (BR-PT-021).
   * Receptionists see only non-financial fields; dentists see row-level counts
   * for encounters they own; admins/receptionists see full billing summary.
   */
  async getDetailWithSummary(id: string, actor: JwtPayload) {
    const detail = await this.getById(id);

    const isDentist =
      !actor.permissions.includes('patient.delete') &&
      actor.permissions.includes('patient.read') &&
      !actor.permissions.includes('invoice.read.any');

    // BR-PT-014: dentist row-level count
    let encountersCount: number;
    if (isDentist) {
      encountersCount = await this.prisma.encounter.count({
        where: { patientId: id, dentistId: actor.sub },
      });
    } else {
      encountersCount = await this.prisma.encounter.count({ where: { patientId: id } });
    }

    const canSeeFinancials = actor.permissions.includes('invoice.read.any');
    let financials:
      | {
          totalInvoices: number;
          totalPaid: number;
          totalOutstanding: number;
        }
      | Record<string, never> = {};

    if (canSeeFinancials) {
      const invoices = await this.prisma.invoice.findMany({
        where: { patientId: id, deletedAt: null },
        select: { status: true, paidAmount: true, outstandingAmount: true },
      });
      financials = {
        totalInvoices: invoices.length,
        totalPaid: invoices
          .filter(i => i.status === 'PAID' || i.status === 'PARTIAL')
          .reduce((acc, i) => acc + Number(i.paidAmount ?? 0), 0),
        totalOutstanding: invoices
          .filter(i => i.status === 'PARTIAL' || i.status === 'ISSUED')
          .reduce((acc, i) => acc + Number(i.outstandingAmount ?? 0), 0),
      };
    }

    return {
      ...detail,
      summary: {
        totalEncounters: encountersCount,
        ...financials,
        lastVisitAt: detail.lastVisitAt,
        lastVisitBy: detail.lastVisitBy,
      },
    };
  }

  async list(
    query: ListPatientsQueryDto,
    actor: JwtPayload,
  ): Promise<PaginatedResult<ReturnType<PatientsService['toPatientListItem']>>> {
    const parsed = PaginationSchema.parse({
      pageSize: (query as unknown as { pageSize?: number }).pageSize,
      cursor: (query as unknown as { cursor?: string }).cursor,
    });
    const pageSize = parsed.pageSize ?? 20;

    // status='active' (default) excludes soft-deleted rows; 'all' or any other
    // value includes them. `includeDeleted` is the legacy query knob and is
    // kept for backwards compatibility — admin permission required in both cases.
    const canSeeDeleted = actor.permissions.includes('patient.delete');
    const wantsDeleted =
      (query.status !== undefined && query.status !== 'active') ||
      (!!query.includeDeleted && canSeeDeleted);
    const includeDeleted = wantsDeleted && canSeeDeleted;
    const where: Prisma.PatientWhereInput = {
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(query.q && {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { primaryPhone: { contains: query.q } },
          { code: { equals: query.q } },
        ],
      }),
      ...(query.gender && { gender: query.gender }),
      ...((query.dobFrom || query.dobTo) && {
        dob: {
          ...(query.dobFrom && { gte: new Date(query.dobFrom) }),
          ...(query.dobTo && { lte: new Date(query.dobTo) }),
        },
      }),
    };

    // BR-PT-014: row-level filter for dentist
    const isPrivileged =
      actor.permissions.includes('patient.delete') ||
      actor.permissions.includes('patient.update') ||
      !actor.permissions.includes('patient.read');
    if (!isPrivileged) {
      const encounters = await this.prisma.encounter.findMany({
        where: { dentistId: actor.sub },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const patientIds = encounters.map(e => e.patientId);
      where.id = {
        in: patientIds.length === 0 ? ['00000000-0000-0000-0000-000000000000'] : patientIds,
      };
    }

    const items = await this.prisma.patient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize + 1,
      ...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > pageSize;
    const trimmed = hasMore ? items.slice(0, pageSize) : items;
    const summaries = await this.batchLastVisit(trimmed.map(p => p.id));

    return {
      data: trimmed.map(p => ({
        ...this.toPatientListItem(p),
        lastVisitAt: summaries.get(p.id)?.lastVisitAt ?? null,
        lastVisitBy: summaries.get(p.id)?.lastVisitBy ?? null,
      })),
      pagination: {
        pageSize,
        nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
        hasMore,
      },
    };
  }

  private async batchLastVisit(
    patientIds: string[],
  ): Promise<Map<string, { lastVisitAt: Date | null; lastVisitBy: string | null }>> {
    if (patientIds.length === 0) return new Map();
    const rows = await this.prisma.encounter.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { startedAt: 'desc' },
      select: {
        patientId: true,
        startedAt: true,
        dentist: { select: { fullName: true } },
      },
      distinct: ['patientId'],
    });
    const map = new Map<string, { lastVisitAt: Date | null; lastVisitBy: string | null }>();
    for (const r of rows) {
      map.set(r.patientId, {
        lastVisitAt: r.startedAt,
        lastVisitBy: r.dentist?.fullName ?? null,
      });
    }
    return map;
  }

  async lookup(query: LookupPatientDto, _actor: JwtPayload) {
    const limit = Math.min(query.limit ?? 5, 10);

    type Candidate = {
      id: string;
      code: string;
      fullName: string;
      dob: Date;
      gender: Gender;
      primaryPhone: string | null;
      lastVisitAt: Date | null;
      lastVisitBy: string | null;
      matchType: 'phone_exact' | 'cccd_exact' | 'name_dob' | 'name_fuzzy';
    };

    const candidates: Candidate[] = [];
    let matchType: Candidate['matchType'] = 'name_fuzzy';

    let patientRows: Array<{
      id: string;
      code: string;
      fullName: string;
      dob: Date;
      gender: Gender;
      primaryPhone: string | null;
    }> = [];

    if (query.phone) {
      matchType = 'phone_exact';
      patientRows = await this.prisma.patient.findMany({
        where: { primaryPhone: query.phone, deletedAt: null },
        take: limit,
      });
    } else if (query.cccd) {
      matchType = 'cccd_exact';
      const ids = await this.prisma.patientIdentifier.findMany({
        where: { value: query.cccd, deletedAt: null },
        take: limit,
        select: { patientId: true },
      });
      patientRows = await this.prisma.patient.findMany({
        where: { id: { in: ids.map(i => i.patientId) } },
        take: limit,
      });
    } else if (query.name && query.dob) {
      matchType = 'name_dob';
      patientRows = await this.prisma.patient.findMany({
        where: {
          fullName: { equals: query.name, mode: 'insensitive' },
          dob: new Date(query.dob),
          deletedAt: null,
        },
        take: limit,
      });
    } else if (query.name) {
      patientRows = await this.prisma.patient.findMany({
        where: {
          fullName: { contains: query.name, mode: 'insensitive' },
          deletedAt: null,
        },
        take: limit,
      });
    }

    if (patientRows.length === 0) {
      return { candidates, total: 0, matchType };
    }

    const lastVisits = await this.batchLastVisit(patientRows.map(p => p.id));
    for (const p of patientRows) {
      candidates.push({
        id: p.id,
        code: p.code,
        fullName: p.fullName,
        dob: p.dob,
        gender: p.gender,
        primaryPhone: p.primaryPhone,
        lastVisitAt: lastVisits.get(p.id)?.lastVisitAt ?? null,
        lastVisitBy: lastVisits.get(p.id)?.lastVisitBy ?? null,
        matchType,
      });
    }

    return { candidates, total: candidates.length, matchType };
  }

  // ============================================================================
  // Phone history + identifier management
  // ============================================================================

  async getPhoneHistory(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: { primaryPhone: true },
    });
    if (!patient) throw new PatientNotFoundException(id);

    const rows = await this.prisma.patientPhoneHistory.findMany({
      where: { patientId: id },
      orderBy: { changedAt: 'desc' },
    });

    return { data: rows, currentPhone: patient.primaryPhone };
  }

  async addIdentifier(id: string, dto: PatientIdentifierInputDto, actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new PatientNotFoundException(id);

    if (!isValidIdentifierValue(dto.type, dto.value)) {
      throw new PatientContactRequiredException(`Giấy tờ ${dto.type} không hợp lệ`);
    }
    const existing = await this.prisma.patientIdentifier.findFirst({
      where: { type: dto.type, value: dto.value, deletedAt: null },
      select: { id: true, patientId: true },
    });
    if (existing && existing.patientId !== id) {
      throw new IdentifierAlreadyExistsException(dto.type, dto.value);
    }

    const created = await this.prisma.patientIdentifier.create({
      data: {
        patientId: id,
        type: dto.type,
        value: dto.value,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        issuedBy: dto.issuedBy ?? null,
        createdBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'PATIENT_IDENTIFIER_ADDED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
      metadata: { identifierId: created.id, type: dto.type },
    });

    return created;
  }

  async removeIdentifier(id: string, identId: string, actor: JwtPayload) {
    const ident = await this.prisma.patientIdentifier.findUnique({ where: { id: identId } });
    if (!ident || ident.patientId !== id) throw new PatientNotFoundException(id);

    await this.prisma.patientIdentifier.update({
      where: { id: identId },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      action: 'PATIENT_IDENTIFIER_REMOVED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: id,
      metadata: { identifierId: identId },
    });
  }

  // ============================================================================
  // Merge (BR-PT-019 / BR-PT-020)
  // ============================================================================

  async merge(dto: MergePatientsDto, actor: JwtPayload) {
    const source = await this.prisma.patient.findUnique({
      where: { id: dto.sourcePatientId },
    });
    const target = await this.prisma.patient.findUnique({
      where: { id: dto.targetPatientId },
    });
    if (!source) throw new PatientNotFoundException(dto.sourcePatientId);
    if (!target) throw new PatientNotFoundException(dto.targetPatientId);
    if (source.deletedAt) throw new PatientMergeInvalidException('Source patient is deleted');
    if (target.deletedAt) throw new PatientMergeInvalidException('Target patient is deleted');
    if (source.fullName.trim().toLowerCase() !== target.fullName.trim().toLowerCase()) {
      throw new PatientMergeInvalidException(
        'BR-PT-019: Source and target must have the same full name (case-insensitive)',
      );
    }
    if (source.dob.getTime() !== target.dob.getTime()) {
      throw new PatientMergeInvalidException(
        'BR-PT-019: Source and target must have the same date of birth',
      );
    }

    const [srcFutureAppts, srcOutstandingInvoices] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          patientId: source.id,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] },
          startAt: { gte: new Date() },
          deletedAt: null,
        },
      }),
      this.prisma.invoice.count({
        where: {
          patientId: source.id,
          status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] },
          deletedAt: null,
        },
      }),
    ]);
    if (srcFutureAppts > 0) {
      throw new PatientMergeInvalidException(
        `Source patient has ${srcFutureAppts} future appointments`,
      );
    }
    if (srcOutstandingInvoices > 0) {
      throw new PatientMergeInvalidException(
        `Source patient has ${srcOutstandingInvoices} outstanding invoices`,
      );
    }

    const result = await this.prisma.$transaction(async tx => {
      const apptUpdate = await tx.appointment.updateMany({
        where: { patientId: source.id },
        data: { patientId: target.id },
      });
      const encUpdate = await tx.encounter.updateMany({
        where: { patientId: source.id },
        data: { patientId: target.id },
      });
      const invUpdate = await tx.invoice.updateMany({
        where: { patientId: source.id },
        data: { patientId: target.id },
      });
      const identUpdate = await tx.patientIdentifier.updateMany({
        where: { patientId: source.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      await tx.patientMergeLog.create({
        data: {
          sourcePatientId: source.id,
          targetPatientId: target.id,
          fieldMapping: {
            kept: {
              fullName: target.fullName,
              dob: target.dob,
              gender: target.gender,
              primaryPhone: target.primaryPhone,
            },
            discardedFromSource: {
              primaryPhone: source.primaryPhone,
              email: source.email,
            },
          },
          migratedFkCount: {
            appointments: apptUpdate.count,
            encounters: encUpdate.count,
            invoices: invUpdate.count,
            identifiers: identUpdate.count,
          },
          mergedBy: actor.sub,
        },
      });

      await tx.patient.update({
        where: { id: source.id },
        data: {
          deletedAt: new Date(),
          deletedBy: actor.sub,
          primaryPhone: null,
          notes: `[MERGED→${target.code}] ${source.notes ?? ''}`.slice(0, 2000),
        },
      });

      return {
        migrated: {
          appointments: apptUpdate.count,
          encounters: encUpdate.count,
          invoices: invUpdate.count,
          identifiersDropped: identUpdate.count,
        },
      };
    });

    await this.audit.log({
      action: 'PATIENT_MERGED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: target.id,
      metadata: {
        sourcePatientId: source.id,
        sourceCode: source.code,
        targetCode: target.code,
        reason: dto.reason,
        ...result.migrated,
      },
    });

    return {
      merged: true,
      target: { id: target.id, code: target.code },
      sourceArchived: { id: source.id, code: source.code },
      migrated: result.migrated,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private toPatientListItem(p: {
    id: string;
    code: string;
    fullName: string;
    dob: Date;
    gender: Gender;
    primaryPhone: string | null;
    createdAt: Date;
    deletedAt: Date | null;
  }) {
    return {
      id: p.id,
      code: p.code,
      fullName: p.fullName,
      dob: p.dob,
      gender: p.gender,
      primaryPhone: p.primaryPhone,
      createdAt: p.createdAt,
      lastVisitAt: null as Date | null,
      lastVisitBy: null as string | null,
      deletedAt: p.deletedAt ?? null,
    };
  }

  private toPatientDetail(p: {
    id: string;
    code: string;
    fullName: string;
    dob: Date;
    gender: Gender;
    primaryPhone: string | null;
    email: string | null;
    address: string | null;
    occupation: string | null;
    allergies: Prisma.JsonValue;
    chronicDiseases: Prisma.JsonValue;
    currentMedications: Prisma.JsonValue;
    contactPersonName: string | null;
    contactPersonPhone: string | null;
    notes: string | null;
    identifiers: Array<{
      id: string;
      type: import('@prisma/client').IdentifierType;
      value: string;
      issuedAt: Date | null;
      issuedBy: string | null;
      createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }) {
    return {
      id: p.id,
      code: p.code,
      fullName: p.fullName,
      dob: p.dob,
      gender: p.gender,
      primaryPhone: p.primaryPhone,
      email: p.email,
      address: p.address,
      occupation: p.occupation,
      allergies: readJsonStringArray(p.allergies),
      chronicDiseases: readJsonStringArray(p.chronicDiseases),
      currentMedications: readJsonStringArray(p.currentMedications),
      contactPersonName: p.contactPersonName,
      contactPersonPhone: p.contactPersonPhone,
      notes: p.notes,
      identifiers: p.identifiers.map(i => ({
        id: i.id,
        type: i.type,
        value: i.value,
        issuedAt: i.issuedAt,
        issuedBy: i.issuedBy,
        createdAt: i.createdAt,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      deletedAt: p.deletedAt ?? null,
    };
  }
}
