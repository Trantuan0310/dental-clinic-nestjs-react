import { Injectable } from '@nestjs/common';
import { AppointmentStatus, BookingRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { LOCKING_TX_OPTIONS, lockDentistCalendar } from '../appointments/domain/advisory-lock';
import { clinicToday, toDateOnly } from '../staff/staff-rules';
import { CLINIC_UTC_OFFSET_MS } from '../common/date-range.util';
import {
  AssignServiceDto,
  ChangeAssignmentDto,
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
      bufferBeforeMin: true,
      bufferAfterMin: true,
      isActive: true,
      isFree: true,
      category: { select: { name: true } },
    },
  },
} satisfies Prisma.DentistServiceInclude;

type AssignmentRow = Prisma.DentistServiceGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const vnDay = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

/** Visits still to come that a deactivation would leave without the service. */
const UPCOMING_VISIT: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
/** Online requests not yet turned into a visit (booking.service ACTIVE). */
const OPEN_REQUEST: BookingRequestStatus[] = [
  'PENDING_REVIEW',
  'NEEDS_INFORMATION',
  'PROPOSED',
  'PATIENT_ACCEPTED',
];

/**
 * What a deactivation did to the assignments, kept in its audit entry so
 * reactivating can offer to put them back: running periods it ended (with
 * their previous end) and not-yet-started ones it removed.
 */
type RestorePlan = {
  day: string;
  ended: { id: string; effectiveTo: string | null }[];
  removed: {
    dentistId: string;
    durationMin: number | null;
    price: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
};

type RestoreAction =
  | { kind: 'reopen'; id: string; dentistId: string; effectiveTo: Date | null }
  | {
      kind: 'create';
      dentistId: string;
      durationMin: number | null;
      price: number | null;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    };

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
      data: { code: dto.code, name: this.cleanName(dto.name), sortOrder: dto.sortOrder ?? 0 },
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
          `Nhóm còn ${active} dịch vụ đang hoạt động; hãy ngừng hoặc chuyển chúng sang nhóm khác trước`,
        );
      }
    }
    const updated = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: this.cleanName(dto.name) } : {}),
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
    const paid = await this.paidAssignments(rows);
    return rows.map(r => this.formatService(r, paid.get(r.id)));
  }

  async getService(id: string) {
    const row = await this.findService(id);
    const paid = await this.paidAssignments([row]);
    return this.formatService(row, paid.get(row.id));
  }

  async createService(dto: CreateServiceDto, actor: JwtPayload) {
    this.validateDuration(dto.defaultDurationMin);
    const name = this.cleanName(dto.name);
    const category = await this.findCategory(dto.categoryId);
    if (!category.isActive) throw new CatalogValidationException('Nhóm dịch vụ đã ngừng');
    if (await this.prisma.service.findUnique({ where: { code: dto.code } })) {
      throw new CatalogCodeTakenException(dto.code);
    }
    // A price of 0 is advertised as free, so it must be a choice, not a
    // missing field.
    if (dto.basePrice === undefined && !dto.isFree) {
      throw new CatalogValidationException('Nhập giá niêm yết, hoặc chọn "Dịch vụ miễn phí"');
    }
    const pricing = this.pricing(dto.basePrice ?? 0, !!dto.isFree);
    const created = await this.prisma.service.create({
      data: {
        code: dto.code,
        categoryId: dto.categoryId,
        name,
        description: dto.description ?? null,
        defaultDurationMin: dto.defaultDurationMin,
        bufferBeforeMin: dto.bufferBeforeMin ?? 0,
        bufferAfterMin: dto.bufferAfterMin ?? 0,
        basePrice: pricing.basePrice,
        isFree: pricing.isFree,
        bookableOnline: dto.bookableOnline ?? true,
        showPublicPrice: dto.showPublicPrice ?? true,
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
    const name = dto.name !== undefined ? this.cleanName(dto.name) : undefined;
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      const category = await this.findCategory(dto.categoryId);
      if (!category.isActive) throw new CatalogValidationException('Nhóm dịch vụ đã ngừng');
    }
    const data: Prisma.ServiceUncheckedUpdateInput = { updatedBy: actor.sub };
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (name !== undefined) data.name = name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.defaultDurationMin !== undefined) data.defaultDurationMin = dto.defaultDurationMin;
    if (dto.bufferBeforeMin !== undefined) data.bufferBeforeMin = dto.bufferBeforeMin;
    if (dto.bufferAfterMin !== undefined) data.bufferAfterMin = dto.bufferAfterMin;
    if (dto.basePrice !== undefined || dto.isFree !== undefined) {
      // Ticking "free" sets the price to 0; typing a price above 0 on a free
      // service without touching the box makes it a paid one again.
      const isFree =
        dto.isFree ?? (current.isFree && !(dto.basePrice !== undefined && dto.basePrice > 0));
      const price = dto.basePrice ?? (isFree ? 0 : Number(current.basePrice));
      Object.assign(data, this.pricing(price, isFree));
    }
    if (dto.bookableOnline !== undefined) data.bookableOnline = dto.bookableOnline;
    if (dto.showPublicPrice !== undefined) data.showPublicPrice = dto.showPublicPrice;
    if (dto.requiredSpecialty !== undefined) data.requiredSpecialty = dto.requiredSpecialty;

    const updated = await this.prisma.service.update({
      where: { id },
      data,
      include: SERVICE_INCLUDE,
    });
    await this.log('SERVICE_UPDATED', actor, 'service', id, {
      changes: Object.keys(dto),
      ...(data.basePrice !== undefined
        ? { basePrice: { from: Number(current.basePrice), to: Number(data.basePrice) } }
        : {}),
    });
    return this.formatService(updated);
  }

  /**
   * What turning a service off/on would touch, for the confirmation dialog:
   * visits still to come and open online requests that use it, and the
   * assignments it would end; or, for an inactive service, how many of the
   * assignments its deactivation ended could be restored.
   */
  async serviceImpact(id: string) {
    const service = await this.findService(id);
    const today = clinicToday();
    if (!service.isActive) {
      const actions = await this.restoreActions(this.prisma, service, today);
      return { isActive: false, restorableAssignments: actions.length };
    }
    const [upcomingAppointments, pendingBookingRequests, openAssignments] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          deletedAt: null,
          status: { in: UPCOMING_VISIT },
          startAt: { gte: new Date() },
          services: { some: { serviceId: id } },
        },
      }),
      this.prisma.bookingRequest.count({
        where: { serviceId: id, status: { in: OPEN_REQUEST }, appointmentId: null },
      }),
      this.prisma.dentistService.count({
        where: { serviceId: id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] },
      }),
    ]);
    return { isActive: true, upcomingAppointments, pendingBookingRequests, openAssignments };
  }

  /**
   * BR-SVC-003: deactivate instead of delete; open assignments end today.
   * Reactivating may put back what the last deactivation ended or removed
   * (`restoreAssignments`), for dentists who may still perform it.
   */
  async setServiceActive(
    id: string,
    isActive: boolean,
    actor: JwtPayload,
    options: { restoreAssignments?: boolean } = {},
  ) {
    const current = await this.findService(id);
    if (current.isActive === isActive) {
      throw new CatalogValidationException(
        isActive ? 'Dịch vụ đang hoạt động' : 'Dịch vụ đã ngừng từ trước',
      );
    }
    const today = clinicToday();
    const { updated, ended, restore, restored } = await this.prisma.$transaction(async tx => {
      let plan: RestorePlan | null = null;
      let restoredCount = 0;
      if (!isActive) {
        // Assignments starting in the future are simply removed from the plan;
        // running ones end today.
        const [future, running] = await Promise.all([
          tx.dentistService.findMany({ where: { serviceId: id, effectiveFrom: { gt: today } } }),
          tx.dentistService.findMany({
            where: {
              serviceId: id,
              effectiveFrom: { lte: today },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
            },
          }),
        ]);
        plan = {
          day: day(today)!,
          ended: running.map(r => ({ id: r.id, effectiveTo: day(r.effectiveTo) })),
          removed: future.map(r => ({
            dentistId: r.dentistId,
            durationMin: r.durationMin,
            price: r.price === null ? null : Number(r.price),
            effectiveFrom: day(r.effectiveFrom)!,
            effectiveTo: day(r.effectiveTo),
          })),
        };
        if (future.length > 0) {
          await tx.dentistService.deleteMany({ where: { id: { in: future.map(r => r.id) } } });
        }
        if (running.length > 0) {
          await tx.dentistService.updateMany({
            where: { id: { in: running.map(r => r.id) } },
            data: { effectiveTo: today, updatedBy: actor.sub },
          });
        }
      } else if (options.restoreAssignments) {
        restoredCount = await this.restoreAssignments(tx, current, today, actor);
      }
      const row = await tx.service.update({
        where: { id },
        data: { isActive, updatedBy: actor.sub },
        include: SERVICE_INCLUDE,
      });
      return {
        updated: row,
        ended: plan ? plan.ended.length + plan.removed.length : 0,
        restore: plan,
        restored: restoredCount,
      };
    }, LOCKING_TX_OPTIONS); // restoreAssignments() locks dentist calendars
    await this.log(isActive ? 'SERVICE_ACTIVATED' : 'SERVICE_DEACTIVATED', actor, 'service', id, {
      ...(isActive ? { restoredAssignments: restored } : { endedAssignments: ended, restore }),
    });
    return {
      ...this.formatService(updated),
      endedAssignments: ended,
      restoredAssignments: restored,
    };
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
      throw new CatalogValidationException('Ngày bắt đầu phân công không được ở quá khứ');
    }
    if (dto.durationMin != null) this.validateDuration(dto.durationMin);

    const [profile, service] = await Promise.all([
      this.prisma.dentistProfile.findFirst({ where: { userId: dentistId, deletedAt: null } }),
      this.findService(dto.serviceId),
    ]);
    if (!profile || profile.practiceStatus !== 'ACTIVE') {
      throw new AssignmentNotAllowedException('Chỉ phân công dịch vụ cho bác sĩ đang hành nghề');
    }
    if (!service.isActive) {
      throw new AssignmentNotAllowedException('Dịch vụ đã ngừng');
    }
    if (service.requiredSpecialty && !profile.specialties.includes(service.requiredSpecialty)) {
      throw new AssignmentNotAllowedException(
        `Dịch vụ yêu cầu chuyên môn ${service.requiredSpecialty}`,
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
    }, LOCKING_TX_OPTIONS);
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
    if (!row) throw new CatalogNotFoundException('phân công', assignmentId);
    if (row.effectiveTo) throw new CatalogValidationException('Phân công đã có ngày kết thúc');
    const today = clinicToday();
    const effectiveTo = to ? toDateOnly(to) : today;
    if (effectiveTo < today) {
      throw new CatalogValidationException('Ngày kết thúc không được ở quá khứ');
    }

    if (row.effectiveFrom > today) {
      await this.prisma.dentistService.delete({ where: { id: assignmentId } });
      await this.log('DENTIST_SERVICE_CANCELLED', actor, 'dentist_service', assignmentId, {
        dentistId,
        serviceId: row.serviceId,
      });
      return { ...this.formatAssignment(row, today), removed: true };
    }
    if (effectiveTo < row.effectiveFrom) {
      throw new CatalogValidationException('Ngày kết thúc trước ngày bắt đầu phân công');
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

  /**
   * New duration/price for a dentist's service from `effectiveFrom` on
   * (today or later): the running period ends the day before and a new one
   * starts that day, so bookings keep the terms of their own day. A period
   * that starts on that day is simply updated.
   */
  async changeAssignment(
    dentistId: string,
    assignmentId: string,
    dto: ChangeAssignmentDto,
    actor: JwtPayload,
  ) {
    const today = clinicToday();
    const from = toDateOnly(dto.effectiveFrom);
    if (from < today) {
      throw new CatalogValidationException('Ngày áp dụng không được ở quá khứ');
    }
    if (dto.durationMin != null) this.validateDuration(dto.durationMin);

    const { row, result } = await this.prisma.$transaction(async tx => {
      await lockDentistCalendar(tx, dentistId);
      const row = await tx.dentistService.findFirst({
        where: { id: assignmentId, dentistId },
        include: ASSIGNMENT_INCLUDE,
      });
      if (!row) throw new CatalogNotFoundException('phân công', assignmentId);
      if (!row.service.isActive) throw new AssignmentNotAllowedException('Dịch vụ đã ngừng');
      if (row.effectiveTo && row.effectiveTo < from) {
        throw new CatalogValidationException(
          `Phân công kết thúc ngày ${vnDay(row.effectiveTo)}, trước ngày áp dụng`,
        );
      }
      if (from < row.effectiveFrom) {
        throw new CatalogValidationException(
          `Phân công bắt đầu từ ${vnDay(row.effectiveFrom)}; chọn ngày áp dụng từ ngày đó`,
        );
      }
      const oldPrice = row.price === null ? null : Number(row.price);
      const durationMin = dto.durationMin === undefined ? row.durationMin : dto.durationMin;
      const price = dto.price === undefined ? oldPrice : dto.price;
      if (durationMin === row.durationMin && price === oldPrice) {
        throw new CatalogValidationException('Thời lượng và giá không thay đổi');
      }
      if (from.getTime() === row.effectiveFrom.getTime()) {
        const result = await tx.dentistService.update({
          where: { id: row.id },
          data: { durationMin, price, updatedBy: actor.sub },
          include: ASSIGNMENT_INCLUDE,
        });
        return { row, result };
      }
      // Close first: only one open period per dentist and service (020).
      await tx.dentistService.update({
        where: { id: row.id },
        data: { effectiveTo: addDays(from, -1), updatedBy: actor.sub },
      });
      const result = await tx.dentistService.create({
        data: {
          dentistId,
          serviceId: row.serviceId,
          durationMin,
          price,
          effectiveFrom: from,
          effectiveTo: row.effectiveTo,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        include: ASSIGNMENT_INCLUDE,
      });
      return { row, result };
    }, LOCKING_TX_OPTIONS);
    // Visits already booked from that day on keep the price and length
    // frozen at booking (appointment_services); the front desk is told how
    // many, so it can adjust them if the clinic wants the new terms applied.
    const affectedAppointments = await this.prisma.appointment.count({
      where: {
        dentistId,
        deletedAt: null,
        status: { in: UPCOMING_VISIT },
        startAt: {
          gte: new Date(Math.max(Date.now(), from.getTime() - CLINIC_UTC_OFFSET_MS)),
          ...(result.effectiveTo
            ? { lt: new Date(addDays(result.effectiveTo, 1).getTime() - CLINIC_UTC_OFFSET_MS) }
            : {}),
        },
        services: { some: { serviceId: row.serviceId } },
      },
    });
    await this.log('DENTIST_SERVICE_CHANGED', actor, 'dentist_service', result.id, {
      dentistId,
      serviceId: row.serviceId,
      previousId: row.id,
      effectiveFrom: day(from),
      durationMin: { from: row.durationMin, to: result.durationMin },
      price: {
        from: row.price === null ? null : Number(row.price),
        to: result.price === null ? null : Number(result.price),
      },
      affectedAppointments,
    });
    return { ...this.formatAssignment(result, today), affectedAppointments };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private validateDuration(minutes: number) {
    if (minutes % 5 !== 0) {
      throw new CatalogValidationException('Thời lượng phải là bội số của 5 phút');
    }
  }

  /** Names are trimmed; blank or one-letter names are refused. */
  private cleanName(value: string) {
    const name = value.trim();
    if (name.length < 2) throw new CatalogValidationException('Tên phải có ít nhất 2 ký tự');
    return name;
  }

  /** A free service costs 0; anything else keeps its price. */
  private pricing(basePrice: number, isFree: boolean) {
    if (isFree && basePrice > 0) {
      throw new CatalogValidationException('Dịch vụ miễn phí phải có giá 0 đ');
    }
    return { basePrice, isFree };
  }

  /**
   * The restorable part of the last deactivation's plan (see RestorePlan):
   * periods still ending where it left them, not already over, for dentists
   * who still practise (with the required specialty), and not overlapping
   * anything assigned since.
   */
  private async restoreActions(
    client: Prisma.TransactionClient,
    service: ServiceRow,
    today: Date,
    /** Called with the dentists involved before anything is checked (locks). */
    beforeCheck?: (dentistIds: string[]) => Promise<void>,
  ): Promise<RestoreAction[]> {
    const entry = await client.auditLog.findFirst({
      where: { action: 'SERVICE_DEACTIVATED', targetType: 'service', targetId: service.id },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });
    const plan = (entry?.metadata as { restore?: RestorePlan } | null | undefined)?.restore;
    if (!plan || !Array.isArray(plan.ended) || !Array.isArray(plan.removed)) return [];

    const endedOn = toDateOnly(plan.day).getTime();
    const rows = plan.ended.length
      ? await client.dentistService.findMany({
          where: { id: { in: plan.ended.map(e => e.id) }, serviceId: service.id },
        })
      : [];
    const byId = new Map(rows.map(r => [r.id, r]));
    const candidates: RestoreAction[] = [];
    for (const e of plan.ended) {
      const row = byId.get(e.id);
      if (!row?.effectiveTo || row.effectiveTo.getTime() !== endedOn) continue;
      const to = e.effectiveTo ? toDateOnly(e.effectiveTo) : null;
      if (to && to < today) continue;
      // Turned back on the same day: the period simply goes on; later, a
      // new one starts today (the days it was off stay off).
      candidates.push(
        row.effectiveTo >= today
          ? { kind: 'reopen', id: row.id, dentistId: row.dentistId, effectiveTo: to }
          : {
              kind: 'create',
              dentistId: row.dentistId,
              durationMin: row.durationMin,
              price: row.price === null ? null : Number(row.price),
              effectiveFrom: today,
              effectiveTo: to,
            },
      );
    }
    for (const r of plan.removed) {
      const start = toDateOnly(r.effectiveFrom);
      const from = start > today ? start : today;
      const to = r.effectiveTo ? toDateOnly(r.effectiveTo) : null;
      if (to && to < from) continue;
      candidates.push({
        kind: 'create',
        dentistId: r.dentistId,
        durationMin: r.durationMin,
        price: r.price,
        effectiveFrom: from,
        effectiveTo: to,
      });
    }
    if (candidates.length === 0) return [];
    const dentistIds = [...new Set(candidates.map(c => c.dentistId))].sort();
    await beforeCheck?.(dentistIds);

    const profiles = await client.dentistProfile.findMany({
      where: {
        userId: { in: dentistIds },
        deletedAt: null,
        practiceStatus: 'ACTIVE',
      },
      select: { userId: true, specialties: true },
    });
    const required = service.requiredSpecialty;
    const allowed = new Set(
      profiles.filter(p => !required || p.specialties.includes(required)).map(p => p.userId),
    );
    const result: RestoreAction[] = [];
    const span = (c: RestoreAction) => ({
      from: (c.kind === 'reopen' ? today : c.effectiveFrom).getTime(),
      to: c.effectiveTo ? c.effectiveTo.getTime() : Infinity,
    });
    for (const c of candidates) {
      if (!allowed.has(c.dentistId)) continue;
      // Nor with another period restored for the same dentist.
      const mine = span(c);
      const overlapsKept = result.some(k => {
        if (k.dentistId !== c.dentistId) return false;
        const other = span(k);
        return other.from <= mine.to && mine.from <= other.to;
      });
      if (overlapsKept) continue;
      const from = c.kind === 'reopen' ? today : c.effectiveFrom;
      const clash = await client.dentistService.findFirst({
        where: {
          dentistId: c.dentistId,
          serviceId: service.id,
          ...(c.kind === 'reopen' ? { id: { not: c.id } } : {}),
          ...(c.effectiveTo ? { effectiveFrom: { lte: c.effectiveTo } } : {}),
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        select: { id: true },
      });
      if (!clash) result.push(c);
    }
    return result;
  }

  private async restoreAssignments(
    tx: Prisma.TransactionClient,
    service: ServiceRow,
    today: Date,
    actor: JwtPayload,
  ) {
    // Same lock as assign(), taken in id order, before the overlap checks.
    const actions = await this.restoreActions(tx, service, today, async ids => {
      for (const id of ids) await lockDentistCalendar(tx, id);
    });
    for (const a of actions) {
      if (a.kind === 'reopen') {
        await tx.dentistService.update({
          where: { id: a.id },
          data: { effectiveTo: a.effectiveTo, updatedBy: actor.sub },
        });
      } else {
        await tx.dentistService.create({
          data: {
            dentistId: a.dentistId,
            serviceId: service.id,
            durationMin: a.durationMin,
            price: a.price,
            effectiveFrom: a.effectiveFrom,
            effectiveTo: a.effectiveTo,
            createdBy: actor.sub,
            updatedBy: actor.sub,
          },
        });
      }
    }
    return actions.length;
  }

  private async findCategory(id: string) {
    const row = await this.prisma.serviceCategory.findUnique({ where: { id } });
    if (!row) throw new CatalogNotFoundException('nhóm dịch vụ', id);
    return row;
  }

  private async findService(id: string): Promise<ServiceRow> {
    const row = await this.prisma.service.findUnique({ where: { id }, include: SERVICE_INCLUDE });
    if (!row) throw new CatalogNotFoundException('dịch vụ', id);
    return row;
  }

  /**
   * Free services a dentist still charges for (own price > 0, current or
   * planned): the public list then shows that price, so the page warns.
   */
  private async paidAssignments(rows: ServiceRow[]) {
    const free = rows.filter(r => r.isFree).map(r => r.id);
    const counts = new Map<string, number>();
    if (free.length === 0) return counts;
    const paid = await this.prisma.dentistService.findMany({
      where: {
        serviceId: { in: free },
        price: { gt: 0 },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: clinicToday() } }],
      },
      select: { serviceId: true },
    });
    for (const p of paid) counts.set(p.serviceId, (counts.get(p.serviceId) ?? 0) + 1);
    return counts;
  }

  private formatService(r: ServiceRow, paidAssignments = 0) {
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
      isFree: r.isFree,
      paidAssignments,
      bookableOnline: r.bookableOnline,
      showPublicPrice: r.showPublicPrice,
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
        bufferBeforeMin: r.service.bufferBeforeMin,
        bufferAfterMin: r.service.bufferAfterMin,
        isFree: r.service.isFree,
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
