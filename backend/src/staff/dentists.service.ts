import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import {
  ChangePracticeStatusDto,
  DENTIST_SELF_EDITABLE_FIELDS,
  ListDentistsQueryDto,
  UpdateDentistProfileDto,
} from './dto/staff.dto';
import {
  DentistHasFutureAppointmentsException,
  DentistProfileNotFoundException,
  EmployeeValidationException,
  LicenseNumberTakenException,
} from './staff.exceptions';
import { futureActiveAppointments, toDateOnly } from './staff-rules';
import type { RequestMeta } from './employees.service';

const PROFILE_INCLUDE = {
  employee: {
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      email: true,
      employmentStatus: true,
    },
  },
  user: { select: { email: true, status: true } },
} satisfies Prisma.DentistProfileInclude;

type ProfileRow = Prisma.DentistProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

@Injectable()
export class DentistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListDentistsQueryDto) {
    const where: Prisma.DentistProfileWhereInput = { deletedAt: null };
    if (query.status) where.practiceStatus = query.status;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { employee: { fullName: { contains: q, mode: 'insensitive' } } },
        { employee: { code: { contains: q, mode: 'insensitive' } } },
        { licenseNumber: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.dentistProfile.findMany({
      where,
      include: PROFILE_INCLUDE,
      orderBy: { employee: { fullName: 'asc' } },
    });
    return rows.map(r => this.format(r));
  }

  async getByUserId(userId: string) {
    return this.format(await this.findOrThrow(userId));
  }

  async update(userId: string, dto: UpdateDentistProfileDto, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(userId);
    const canUpdateAny = actor.permissions.includes('dentist.update');
    if (!canUpdateAny) {
      // dentist.update.own: only their own profile, only the self-service fields.
      if (actor.sub !== userId || !actor.permissions.includes('dentist.update.own')) {
        throw new ForbiddenException('You can only edit your own dentist profile');
      }
      const allowed: readonly string[] = DENTIST_SELF_EDITABLE_FIELDS;
      const forbidden = Object.keys(dto).filter(
        k => dto[k as keyof UpdateDentistProfileDto] !== undefined && !allowed.includes(k),
      );
      if (forbidden.length > 0) {
        throw new ForbiddenException(`Only an admin can change: ${forbidden.join(', ')}`);
      }
    }

    const data: Prisma.DentistProfileUncheckedUpdateInput = { updatedBy: actor.sub };
    if (dto.licenseNumber !== undefined) {
      const license = dto.licenseNumber?.trim() || null;
      if (license && license !== current.licenseNumber) {
        const taken = await this.prisma.dentistProfile.findFirst({
          where: { licenseNumber: license, deletedAt: null, id: { not: current.id } },
        });
        if (taken) throw new LicenseNumberTakenException(license);
      }
      data.licenseNumber = license;
    }
    if (dto.licenseIssuedAt !== undefined) {
      data.licenseIssuedAt = dto.licenseIssuedAt ? toDateOnly(dto.licenseIssuedAt) : null;
    }
    if (dto.specialties !== undefined) data.specialties = dto.specialties;
    if (dto.calendarColor !== undefined) data.calendarColor = dto.calendarColor;
    if (dto.defaultSlotMinutes !== undefined) data.defaultSlotMinutes = dto.defaultSlotMinutes;
    if (dto.acceptsOnlineBooking !== undefined)
      data.acceptsOnlineBooking = dto.acceptsOnlineBooking;
    if (dto.acceptsNewPatients !== undefined) data.acceptsNewPatients = dto.acceptsNewPatients;
    if (dto.bio !== undefined) data.bio = dto.bio;

    const updated = await this.prisma.dentistProfile.update({
      where: { userId },
      data,
      include: PROFILE_INCLUDE,
    });
    await this.log('DENTIST_PROFILE_UPDATED', actor, current.id, meta, {
      userId,
      changes: Object.keys(dto),
      self: !canUpdateAny,
    });
    return this.format(updated);
  }

  /** Suspend or retire a dentist (BR-STAFF-004). */
  async deactivate(
    userId: string,
    dto: ChangePracticeStatusDto,
    actor: JwtPayload,
    meta: RequestMeta,
  ) {
    const current = await this.findOrThrow(userId);
    if (current.practiceStatus === dto.status) {
      throw new EmployeeValidationException(`Dentist is already ${dto.status}`);
    }
    const updated = await this.prisma.$transaction(
      async tx => {
        const blocking = await futureActiveAppointments(tx, userId);
        if (blocking.length > 0) throw new DentistHasFutureAppointmentsException(blocking);
        return tx.dentistProfile.update({
          where: { userId },
          data: { practiceStatus: dto.status, updatedBy: actor.sub },
          include: PROFILE_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.log('DENTIST_PRACTICE_STATUS_CHANGED', actor, current.id, meta, {
      userId,
      from: current.practiceStatus,
      to: dto.status,
      reason: dto.reason,
    });
    return this.format(updated);
  }

  async activate(userId: string, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(userId);
    if (current.practiceStatus === 'ACTIVE') {
      throw new EmployeeValidationException('Dentist is already ACTIVE');
    }
    if (
      current.employee.employmentStatus === 'TERMINATED' ||
      current.user.status === 'DEACTIVATED'
    ) {
      throw new EmployeeValidationException(
        'Reinstate the employee and the account before reactivating the dentist',
      );
    }
    const updated = await this.prisma.dentistProfile.update({
      where: { userId },
      data: { practiceStatus: 'ACTIVE', updatedBy: actor.sub },
      include: PROFILE_INCLUDE,
    });
    await this.log('DENTIST_PRACTICE_STATUS_CHANGED', actor, current.id, meta, {
      userId,
      from: current.practiceStatus,
      to: 'ACTIVE',
    });
    return this.format(updated);
  }

  /** Profile + weekly schedule + next bookings, for the dentist detail page. */
  async overview(userId: string) {
    const profile = this.format(await this.findOrThrow(userId));
    const now = new Date();
    const [schedules, upcoming] = await Promise.all([
      this.prisma.workingSchedule.findMany({
        where: {
          dentistId: userId,
          deletedAt: null,
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          validFrom: true,
          validTo: true,
          slotDurationMin: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          dentistId: userId,
          startAt: { gte: now },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
        },
        orderBy: { startAt: 'asc' },
        take: 10,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          patient: { select: { id: true, fullName: true, code: true } },
        },
      }),
    ]);
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    return {
      profile,
      schedules: schedules.map(s => ({
        ...s,
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
        validFrom: s.validFrom.toISOString().slice(0, 10),
        validTo: s.validTo ? s.validTo.toISOString().slice(0, 10) : null,
      })),
      upcomingAppointments: upcoming,
    };
  }

  private async findOrThrow(userId: string): Promise<ProfileRow> {
    const row = await this.prisma.dentistProfile.findFirst({
      where: { userId, deletedAt: null },
      include: PROFILE_INCLUDE,
    });
    if (!row) throw new DentistProfileNotFoundException(userId);
    return row;
  }

  private async log(
    action: string,
    actor: JwtPayload,
    targetId: string,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'dentist_profile',
      targetId,
      metadata,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private format(row: ProfileRow) {
    return {
      id: row.id,
      userId: row.userId,
      employeeId: row.employeeId,
      employeeCode: row.employee.code,
      fullName: row.employee.fullName,
      phone: row.employee.phone,
      email: row.employee.email,
      loginEmail: row.user.email,
      employmentStatus: row.employee.employmentStatus,
      licenseNumber: row.licenseNumber,
      licenseIssuedAt: row.licenseIssuedAt ? row.licenseIssuedAt.toISOString().slice(0, 10) : null,
      specialties: row.specialties,
      calendarColor: row.calendarColor,
      defaultSlotMinutes: row.defaultSlotMinutes,
      acceptsOnlineBooking: row.acceptsOnlineBooking,
      acceptsNewPatients: row.acceptsNewPatients,
      practiceStatus: row.practiceStatus,
      bio: row.bio,
      updatedAt: row.updatedAt,
    };
  }
}
