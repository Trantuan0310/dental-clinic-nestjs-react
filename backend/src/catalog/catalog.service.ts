import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { lockDentistCalendar } from '../appointments/domain/advisory-lock';
import { clinicToday, toDateOnly } from '../staff/staff-rules';
import {
  AssignServiceDto,
  CreateCategoryDto,
  CreateServiceDto,
  ListServicesQueryDto,
  UpdateCategoryDto,
  UpdateServiceDto,
} from './dto/catalog.dto';
import {
  AssignmentNotAllowedException,
  AssignmentOverlapException,
  CatalogCodeTakenException,
  CatalogNotFoundException,
  CatalogValidationException,
} from './catalog.exceptions';

const SERVICE_INCLUDE = {
  category: { select: { id: true, code: true, name: true } },
  _count: {
    select: { dentistServices: { where: { effectiveTo: null } } },
  },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

const ASSIGNMENT_INCLUDE = {
  service: {
    select: {
      id: true,
      code: true,
      name: true,
      defaultDurationMin: true,
      basePrice: true,
      isActive: true,
      category: { select: { name: true } },
    },
  },
} satisfies Prisma.DentistServiceInclude;

type AssignmentRow = Prisma.DentistServiceGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** "Active on date" for an assignment period (inclusive both ends). */
export const activeOn = (date: Date): Prisma.DentistServiceWhereInput => ({
  effectiveFrom: { lte: date },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
});

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  listCategories(includeInactive = false) {
    return this.prisma.serviceCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto, actor: JwtPayload) {
    if (await this.prisma.serviceCategory.findUnique({ where: { code: dto.code } })) {
      throw new CatalogCodeTakenException(dto.code);
    }
    const created = await this.prisma.serviceCategory.create({
      data: { code: dto.code, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 },
    });
    await this.log('SERVICE_CATEGORY_CREATED', actor, 'service_category', created.id, {
      code: created.code,
    });
    return created;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actor: JwtPayload) {
    await this.findCategory(id);
    if (dto.isActive === false) {
      const active = await this.prisma.service.count({ where: { categoryId: id, isActive: true } });
      if (active > 0) {
        throw new CatalogValidationException(
          `Category still has ${active} active service(s); deactivate or move them first`,
        );
      }
    }
    const updated = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.log('SERVICE_CATEGORY_UPDATED', actor, 'service_category', id, {
      changes: Object.keys(dto),
    });
    return updated;
  }

  // ── Services ──────────────────────────────────────────────────────────────

  async listServices(query: ListServicesQueryDto) {
    const where: Prisma.ServiceWhereInput = {};
    if (!query.includeInactive) where.isActive = true;
    if (query.categoryId) where.categoryId = query.categoryId;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.service.findMany({
      where,
      include: SERVICE_INCLUDE,
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(r => this.formatService(r));
  }

  async getService(id: string) {
    return this.formatService(await this.findService(id));
  }

  async createService(dto: CreateServiceDto, actor: JwtPayload) {
    this.validateDuration(dto.defaultDurationMin);
    const category = await this.findCategory(dto.categoryId);
    if (!category.isActive) throw new CatalogValidationException('Category is inactive');
    if (await this.prisma.service.findUnique({ where: { code: dto.code } })) {
      throw new CatalogCodeTakenException(dto.code);
    }
    const created = await this.prisma.service.create({
      data: {
        code: dto.code,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        defaultDurationMin: dto.defaultDurationMin,
        bufferBeforeMin: dto.bufferBeforeMin ?? 0,
        bufferAfterMin: dto.bufferAfterMin ?? 0,
        basePrice: dto.basePrice ?? 0,
        requiredSpecialty: dto.requiredSpecialty ?? null,
        createdBy: actor.sub,
        updatedBy: actor.sub,
      },
      include: SERVICE_INCLUDE,
    });
    await this.log('SERVICE_CREATED', actor, 'service', created.id, { code: created.code });
    return this.formatService(created);
  }

  async updateService(id: string, dto: UpdateServiceDto, actor: JwtPayload) {
    const current = await this.findService(id);
    if (dto.defaultDurationMin !== undefined) this.validateDuration(dto.defaultDurationMin);
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      const category = await this.findCategory(dto.categoryId);
      if (!category.isActive) throw new CatalogValidationException('Category is inactive');
    }
    const data: Prisma.ServiceUncheckedUpdateInput = { updatedBy: actor.sub };
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.defaultDurationMin !== undefined) data.defaultDurationMin = dto.defaultDurationMin;
    if (dto.bufferBeforeMin !== undefined) data.bufferBeforeMin = dto.bufferBeforeMin;
    if (dto.bufferAfterMin !== undefined) data.bufferAfterMin = dto.bufferAfterMin;
    if (dto.basePrice !== undefined) data.basePrice = dto.basePrice;
    if (dto.requiredSpecialty !== undefined) data.requiredSpecialty = dto.requiredSpecialty;

    const updated = await this.prisma.service.update({
      where: { id },
      data,
      include: SERVICE_INCLUDE,
    });
    await this.log('SERVICE_UPDATED', actor, 'service', id, {
      changes: Object.keys(dto),
      ...(dto.basePrice !== undefined
        ? { basePrice: { from: Number(current.basePrice), to: dto.basePrice } }
        : {}),
    });
    return this.formatService(updated);
  }

  /** BR-SVC-003: deactivate instead of delete; open assignments end today. */
  async setServiceActive(id: string, isActive: boolean, actor: JwtPayload) {
    const current = await this.findService(id);
    if (current.isActive === isActive) {
      throw new CatalogValidationException(
        `Service is already ${isActive ? 'active' : 'inactive'}`,
      );
    }
    const today = clinicToday();
    const { updated, ended } = await this.prisma.$transaction(async tx => {
      let endedCount = 0;
      if (!isActive) {
        // Assignments starting in the future are simply removed from the plan;
        // running ones end today.
        const future = await tx.dentistService.deleteMany({
          where: { serviceId: id, effectiveFrom: { gt: today } },
        });
        const running = await tx.dentistService.updateMany({
          where: { serviceId: id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] },
          data: { effectiveTo: today, updatedBy: actor.sub },
        });
        endedCount = future.count + running.count;
      }
      const row = await tx.service.update({
        where: { id },
        data: { isActive, updatedBy: actor.sub },
        include: SERVICE_INCLUDE,
      });
      return { updated: row, ended: endedCount };
    });
    await this.log(isActive ? 'SERVICE_ACTIVATED' : 'SERVICE_DEACTIVATED', actor, 'service', id, {
      endedAssignments: ended,
    });
    return this.formatService(updated);
  }

  // ── Dentist ↔ service ─────────────────────────────────────────────────────

  /** A dentist's assignments; `current` = active today (or on `date`). */
  async listDentistServices(dentistId: string, date?: string) {
    const on = date ? toDateOnly(date) : clinicToday();
    const rows = await this.prisma.dentistService.findMany({
      where: { dentistId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ service: { name: 'asc' } }, { effectiveFrom: 'desc' }],
    });
    return rows.map(r => this.formatAssignment(r, on));
  }

  /** Dentists who may perform a service on a date (profile ACTIVE). */
  async listServiceDentists(serviceId: string, date?: string) {
    await this.findService(serviceId);
    const on = date ? toDateOnly(date) : clinicToday();
    const rows = await this.prisma.dentistService.findMany({
      where: {
        serviceId,
        ...activeOn(on),
        dentist: { dentistProfile: { practiceStatus: 'ACTIVE', deletedAt: null } },
      },
      include: {
        ...ASSIGNMENT_INCLUDE,
        dentist: {
          select: { id: true, fullName: true, dentistProfile: { select: { calendarColor: true } } },
        },
      },
      orderBy: { dentist: { fullName: 'asc' } },
    });
    return rows.map(r => ({
      ...this.formatAssignment(r, on),
      dentist: {
        id: r.dentist.id,
        fullName: r.dentist.fullName,
        calendarColor: r.dentist.dentistProfile?.calendarColor ?? null,
      },
    }));
  }

  /** BR-SVC-004. */
  async assign(dentistId: string, dto: AssignServiceDto, actor: JwtPayload) {
    const today = clinicToday();
    const from = dto.effectiveFrom ? toDateOnly(dto.effectiveFrom) : today;
    if (from < today) {
      throw new CatalogValidationException('An assignment cannot start in the past');
    }
    if (dto.durationMin != null) this.validateDuration(dto.durationMin);

    const [profile, service] = await Promise.all([
      this.prisma.dentistProfile.findFirst({ where: { userId: dentistId, deletedAt: null } }),
      this.findService(dto.serviceId),
    ]);
    if (!profile || profile.practiceStatus !== 'ACTIVE') {
      throw new AssignmentNotAllowedException(
        'Only a dentist with an active practice profile can be assigned services',
      );
    }
    if (!service.isActive) {
      throw new AssignmentNotAllowedException('Service is inactive');
    }
    if (service.requiredSpecialty && !profile.specialties.includes(service.requiredSpecialty)) {
      throw new AssignmentNotAllowedException(
        `Service requires specialty ${service.requiredSpecialty}`,
        'SPECIALTY_REQUIRED',
      );
    }

    const created = await this.prisma.$transaction(async tx => {
      await lockDentistCalendar(tx, dentistId);
      const overlap = await tx.dentistService.findFirst({
        where: {
          dentistId,
          serviceId: dto.serviceId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
      });
      if (overlap) {
        throw new AssignmentOverlapException({
          id: overlap.id,
          effectiveFrom: day(overlap.effectiveFrom)!,
          effectiveTo: day(overlap.effectiveTo),
        });
      }
      return tx.dentistService.create({
        data: {
          dentistId,
          serviceId: dto.serviceId,
          durationMin: dto.durationMin ?? null,
          price: dto.price ?? null,
          effectiveFrom: from,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        include: ASSIGNMENT_INCLUDE,
      });
    });
    await this.log('DENTIST_SERVICE_ASSIGNED', actor, 'dentist_service', created.id, {
      dentistId,
      serviceId: dto.serviceId,
      effectiveFrom: day(from),
    });
    return this.formatAssignment(created, today);
  }

  /** BR-SVC-005: end, don't delete (a not-yet-started period is removed). */
  async endAssignment(
    dentistId: string,
    assignmentId: string,
    to: string | undefined,
    actor: JwtPayload,
  ) {
    const row = await this.prisma.dentistService.findFirst({
      where: { id: assignmentId, dentistId },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!row) throw new CatalogNotFoundException('Assignment', assignmentId);
    if (row.effectiveTo) throw new CatalogValidationException('Assignment has already ended');
    const today = clinicToday();
    const effectiveTo = to ? toDateOnly(to) : today;
    if (effectiveTo < today) throw new CatalogValidationException('End date is in the past');

    if (row.effectiveFrom > today) {
      await this.prisma.dentistService.delete({ where: { id: assignmentId } });
      await this.log('DENTIST_SERVICE_CANCELLED', actor, 'dentist_service', assignmentId, {
        dentistId,
        serviceId: row.serviceId,
      });
      return { ...this.formatAssignment(row, today), removed: true };
    }
    if (effectiveTo < row.effectiveFrom) {
      throw new CatalogValidationException('End date is before the start date');
    }
    const updated = await this.prisma.dentistService.update({
      where: { id: assignmentId },
      data: { effectiveTo, updatedBy: actor.sub },
      include: ASSIGNMENT_INCLUDE,
    });
    await this.log('DENTIST_SERVICE_ENDED', actor, 'dentist_service', assignmentId, {
      dentistId,
      serviceId: row.serviceId,
      effectiveTo: day(effectiveTo),
    });
    return { ...this.formatAssignment(updated, today), removed: false };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private validateDuration(minutes: number) {
    if (minutes % 5 !== 0) {
      throw new CatalogValidationException('Duration must be a multiple of 5 minutes');
    }
  }

  private async findCategory(id: string) {
    const row = await this.prisma.serviceCategory.findUnique({ where: { id } });
    if (!row) throw new CatalogNotFoundException('Category', id);
    return row;
  }

  private async findService(id: string): Promise<ServiceRow> {
    const row = await this.prisma.service.findUnique({ where: { id }, include: SERVICE_INCLUDE });
    if (!row) throw new CatalogNotFoundException('Service', id);
    return row;
  }

  private formatService(r: ServiceRow) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      defaultDurationMin: r.defaultDurationMin,
      bufferBeforeMin: r.bufferBeforeMin,
      bufferAfterMin: r.bufferAfterMin,
      basePrice: Number(r.basePrice),
      requiredSpecialty: r.requiredSpecialty,
      isActive: r.isActive,
      assignedDentists: r._count.dentistServices,
      updatedAt: r.updatedAt,
    };
  }

  /** BR-SVC-006: the dentist's override wins, otherwise the service default. */
  private formatAssignment(r: AssignmentRow, on: Date) {
    const current = r.effectiveFrom <= on && (!r.effectiveTo || r.effectiveTo >= on);
    return {
      id: r.id,
      dentistId: r.dentistId,
      service: {
        id: r.service.id,
        code: r.service.code,
        name: r.service.name,
        categoryName: r.service.category.name,
        isActive: r.service.isActive,
      },
      durationMin: r.durationMin,
      price: r.price === null ? null : Number(r.price),
      effectiveDurationMin: r.durationMin ?? r.service.defaultDurationMin,
      effectivePrice: Number(r.price ?? r.service.basePrice),
      effectiveFrom: day(r.effectiveFrom)!,
      effectiveTo: day(r.effectiveTo),
      current,
    };
  }

  private async log(
    action: string,
    actor: JwtPayload,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType,
      targetId,
      metadata,
    });
  }
}
