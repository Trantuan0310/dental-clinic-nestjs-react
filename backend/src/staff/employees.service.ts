import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EmployeeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { isValidVnPhone } from '../patients/domain/patient-rules';
import {
  CreateDentistProfileDto,
  CreateEmployeeDto,
  LinkAccountDto,
  ListEmployeesQueryDto,
  ReinstateEmployeeDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from './dto/staff.dto';
import {
  DentistHasFutureAppointmentsException,
  DentistHasOpenBookingRequestsException,
  OpenBookingRequestRef,
  DentistProfileNotAllowedException,
  EmployeeNotFoundException,
  EmployeeValidationException,
  LastAdminTerminationException,
  LicenseNumberTakenException,
  StaffLinkConflictException,
} from './staff.exceptions';
import {
  clinicToday,
  assertDentistHasNoOpenWork,
  futureActiveAppointments,
  nextCalendarColor,
  toDateOnly,
} from './staff-rules';
import { EmailAlreadyExistsException } from '../common/exceptions/business-rule.exception';
import { startOfClinicDay } from '../common/date-range.util';
import {
  effectiveDentistId,
  effectiveStartAt,
  OPEN_BOOKING_STATUSES,
} from '../appointments/availability.service';

/**
 * A5-13 / C4: online requests still waiting (on the clinic or the patient)
 * whose dentist — the proposed one while a proposal stands — is this one,
 * for a time from `from` on.
 */
async function openBookingRequestsFor(
  db: Prisma.TransactionClient,
  dentistId: string,
  from: Date,
): Promise<OpenBookingRequestRef[]> {
  const rows =
    (await db.bookingRequest.findMany({
      where: {
        appointmentId: null,
        status: { in: OPEN_BOOKING_STATUSES },
        OR: [{ preferredDentistId: dentistId }, { proposedDentistId: dentistId }],
      },
      select: {
        id: true,
        referenceCode: true,
        fullName: true,
        status: true,
        preferredDentistId: true,
        proposedDentistId: true,
        requestedStartAt: true,
        proposedStartAt: true,
      },
    })) ?? [];
  return rows
    .filter(r => effectiveDentistId(r) === dentistId && effectiveStartAt(r) >= from)
    .map(r => ({
      id: r.id,
      referenceCode: r.referenceCode,
      fullName: r.fullName,
      status: r.status,
      startAt: effectiveStartAt(r),
    }));
}
import { normalizeEmail } from '../common/email.util';

/**
 * Accounts only a user manager may link from the HR screen: clinic admins and
 * anyone who can manage users or roles (linking renames the account).
 */
const PRIVILEGED_ACCOUNT: Prisma.UserWhereInput = {
  userRoles: {
    some: {
      role: {
        OR: [
          { code: 'clinic_admin' },
          {
            rolePermissions: {
              some: {
                permission: {
                  OR: [{ code: { startsWith: 'user.' } }, { code: { startsWith: 'role.' } }],
                  NOT: { code: { endsWith: '.read' } },
                },
              },
            },
          },
        ],
      },
    },
  },
};

/** Default role for an account created from the HR screen, by employee type. */
const ROLE_FOR_TYPE: Partial<Record<EmployeeType, string>> = {
  DENTIST: 'dentist',
  RECEPTIONIST: 'receptionist',
};

const EMPLOYEE_INCLUDE = {
  user: { select: { id: true, email: true, status: true } },
  dentistProfile: {
    select: { id: true, practiceStatus: true, calendarColor: true, licenseNumber: true },
  },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async list(query: ListEmployeesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
    if (query.type) where.employeeType = query.type;
    if (query.status) where.employmentStatus = query.status;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return {
      data: rows.map(r => this.format(r)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string) {
    return this.format(await this.findOrThrow(id));
  }

  async create(dto: CreateEmployeeDto, actor: JwtPayload, meta: RequestMeta) {
    this.validateContact(dto);
    const hireDate = dto.hireDate ? toDateOnly(dto.hireDate) : clinicToday();
    this.validateDob(dto.dob, hireDate);

    const created = await this.prisma.$transaction(async tx => {
      const [{ nextval }] = await tx.$queryRaw<Array<{ nextval: bigint }>>`
        SELECT nextval('employee_code_seq')
      `;
      return tx.employee.create({
        data: {
          code: `NV-${String(Number(nextval)).padStart(5, '0')}`,
          fullName: dto.fullName.trim(),
          employeeType: dto.employeeType,
          dob: dto.dob ? toDateOnly(dto.dob) : null,
          gender: dto.gender ?? null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          address: dto.address?.trim() || null,
          hireDate,
          notes: dto.notes ?? null,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        include: EMPLOYEE_INCLUDE,
      });
    });

    await this.log('EMPLOYEE_CREATED', actor, created.id, meta, {
      code: created.code,
      employeeType: created.employeeType,
    });
    return this.format(created);
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(id);
    if (current.employmentStatus === 'TERMINATED') {
      throw new EmployeeValidationException('A terminated employee cannot be edited');
    }
    this.validateContact(dto);
    const hireDate = dto.hireDate ? toDateOnly(dto.hireDate) : current.hireDate;
    const dob = dto.dob === undefined ? current.dob : dto.dob ? toDateOnly(dto.dob) : null;
    this.validateDob(dob ? dob.toISOString() : null, hireDate);
    if (current.dentistProfile && dto.employeeType && dto.employeeType !== 'DENTIST') {
      throw new EmployeeValidationException(
        'Employee has a dentist profile; deactivate it before changing the employee type',
      );
    }

    const data: Prisma.EmployeeUncheckedUpdateInput = { updatedBy: actor.sub };
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.employeeType !== undefined) data.employeeType = dto.employeeType;
    if (dto.dob !== undefined) data.dob = dob;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.hireDate !== undefined) data.hireDate = hireDate;
    if (dto.employmentStatus !== undefined) data.employmentStatus = dto.employmentStatus;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.employee.update({ where: { id }, data, include: EMPLOYEE_INCLUDE });
      // users.full_name stays the display name everywhere else (staff.md §1).
      if (dto.fullName !== undefined && row.userId) {
        await tx.user.update({
          where: { id: row.userId },
          data: { fullName: row.fullName, updatedBy: actor.sub },
        });
      }
      return row;
    });

    await this.log('EMPLOYEE_UPDATED', actor, id, meta, { changes: Object.keys(dto) });

    // A dentist going on leave stops taking new bookings (validateDentist),
    // but existing ones are left alone — list them so the desk can move them.
    const goingOnLeave =
      dto.employmentStatus === 'ON_LEAVE' && current.employmentStatus !== 'ON_LEAVE';
    if (goingOnLeave && current.dentistProfile && current.userId) {
      const futureAppointments = await futureActiveAppointments(this.prisma, current.userId);
      return { ...this.format(updated), futureAppointments };
    }
    return this.format(updated);
  }

  /**
   * BR-STAFF-004 / BR-STAFF-005. A5-12: a termination date ahead is a plan —
   * the account stays open and the dentist works until then; from that day
   * the calendar is closed to bookings (AvailabilityService) and the daily
   * job carries it out (finalizeScheduledTerminations). Only visits and
   * online requests from that day on must be handled first (A5-13 / C4).
   */
  async terminate(id: string, dto: TerminateEmployeeDto, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(id);
    if (current.employmentStatus === 'TERMINATED') {
      throw new EmployeeValidationException('Employee is already terminated');
    }
    const terminationDate = dto.terminationDate ? toDateOnly(dto.terminationDate) : clinicToday();
    if (terminationDate < current.hireDate) {
      throw new EmployeeValidationException('Termination date is before the hire date');
    }
    if (current.userId === actor.sub) {
      throw new EmployeeValidationException('You cannot terminate your own employee record');
    }
    const planned = terminationDate > clinicToday();
    const firstDayOff = startOfClinicDay(terminationDate.toISOString().slice(0, 10));

    const updated = await this.prisma.$transaction(
      async tx => {
        if (current.dentistProfile && current.userId) {
          if (planned) {
            const blocking = await futureActiveAppointments(
              tx,
              current.userId,
              new Date(),
              firstDayOff,
            );
            if (blocking.length > 0) throw new DentistHasFutureAppointmentsException(blocking);
          } else {
            await assertDentistHasNoOpenWork(tx, current.userId);
          }
          const requests = await openBookingRequestsFor(
            tx,
            current.userId,
            planned ? firstDayOff : new Date(),
          );
          if (requests.length > 0) throw new DentistHasOpenBookingRequestsException(requests);
        }
        if (current.userId) await this.assertNotLastAdmin(tx, current.userId);

        if (planned) {
          return tx.employee.update({
            where: { id },
            data: { terminationDate, updatedBy: actor.sub },
            include: EMPLOYEE_INCLUDE,
          });
        }
        return this.applyTermination(tx, current, terminationDate, actor.sub);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.log(
      planned ? 'EMPLOYEE_TERMINATION_SCHEDULED' : 'EMPLOYEE_TERMINATED',
      actor,
      id,
      meta,
      {
        reason: dto.reason,
        terminationDate: terminationDate.toISOString().slice(0, 10),
        accountDeactivated: !planned && Boolean(current.userId),
      },
    );
    return planned ? { ...this.format(updated), terminationScheduled: true } : this.format(updated);
  }

  /** Close the employee record, the dentist profile and the login, now. */
  private async applyTermination(
    tx: Prisma.TransactionClient,
    current: { id: string; userId: string | null; dentistProfile: unknown },
    terminationDate: Date,
    actorId: string | null,
  ) {
    const row = await tx.employee.update({
      where: { id: current.id },
      data: { employmentStatus: 'TERMINATED', terminationDate, updatedBy: actorId },
      include: EMPLOYEE_INCLUDE,
    });
    if (current.dentistProfile) {
      await tx.dentistProfile.update({
        where: { employeeId: current.id },
        data: { practiceStatus: 'INACTIVE', updatedBy: actorId },
      });
    }
    if (current.userId) {
      await tx.user.update({
        where: { id: current.userId },
        data: { status: 'DEACTIVATED', deactivatedAt: new Date(), updatedBy: actorId },
      });
      await tx.refreshToken.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (current.dentistProfile && current.userId) {
      await this.closeDentistCalendar(tx, current.userId, terminationDate);
    }
    return row;
  }

  /**
   * A1-22: a dentist who leaves keeps no hours to come back to — weekly rows
   * end the day before (past days stay for payroll), pending leave and shift
   * requests from then on are withdrawn. A reinstated dentist gets new hours.
   */
  private async closeDentistCalendar(
    tx: Prisma.TransactionClient,
    dentistId: string,
    terminationDate: Date,
  ) {
    const today = clinicToday();
    const from = terminationDate > today ? terminationDate : today;
    const lastDay = new Date(from.getTime() - 24 * 60 * 60_000);
    await tx.workingSchedule.updateMany({
      where: { dentistId, deletedAt: null, validFrom: { gte: from } },
      data: { deletedAt: new Date() },
    });
    await tx.workingSchedule.updateMany({
      where: {
        dentistId,
        deletedAt: null,
        validFrom: { lt: from },
        OR: [{ validTo: null }, { validTo: { gt: lastDay } }],
      },
      data: { validTo: lastDay },
    });
    await tx.timeOff.updateMany({
      where: {
        dentistId,
        status: 'PENDING',
        deletedAt: null,
        endAt: { gt: startOfClinicDay(from.toISOString().slice(0, 10)) },
      },
      data: {
        status: 'CANCELLED',
        decidedAt: new Date(),
        decisionNote: 'Tự hủy: bác sĩ nghỉ việc',
      },
    });
    await tx.shiftRegistration.updateMany({
      where: { dentistId, status: 'PENDING', deletedAt: null, date: { gte: from } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  /**
   * Daily (StaffCron): carry out the terminations planned for today or
   * earlier. One still blocked (a visit or an exam left open) is retried the
   * next run and logged, never forced.
   */
  async finalizeScheduledTerminations(now: Date = new Date()) {
    const due = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: 'TERMINATED' },
        terminationDate: { lte: clinicToday(now) },
      },
      include: EMPLOYEE_INCLUDE,
    });
    let terminated = 0;
    for (const e of due ?? []) {
      try {
        await this.prisma.$transaction(
          async tx => {
            if (e.dentistProfile && e.userId) await assertDentistHasNoOpenWork(tx, e.userId, now);
            await this.applyTermination(tx, e, e.terminationDate!, null);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        await this.audit.log({
          action: 'EMPLOYEE_TERMINATED',
          targetType: 'employee',
          targetId: e.id,
          metadata: {
            scheduled: true,
            terminationDate: e.terminationDate!.toISOString().slice(0, 10),
            accountDeactivated: Boolean(e.userId),
          },
        });
        terminated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Planned termination of employee ${e.id} postponed: ${msg}`);
      }
    }
    return { terminated };
  }

  /** Link an existing account or create one (BR-STAFF-003). */
  async linkAccount(id: string, dto: LinkAccountDto, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(id);
    if (current.employmentStatus === 'TERMINATED') {
      throw new EmployeeValidationException('A terminated employee cannot get an account');
    }
    if (current.userId) {
      throw new StaffLinkConflictException('Employee already has an account');
    }
    if (Boolean(dto.userId) === Boolean(dto.loginEmail)) {
      throw new EmployeeValidationException('Provide exactly one of userId or loginEmail');
    }

    let userId = dto.userId;
    let inviteSent: boolean | null = null;
    if (userId) {
      const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw new EmployeeValidationException(`User ${userId} not found`);
      if (user.deactivatedAt) {
        throw new EmployeeValidationException(
          'Tài khoản này đã bị vô hiệu hóa; kích hoạt lại ở trang Người dùng trước khi gắn',
        );
      }
      if (
        !actor.permissions.includes('user.update') &&
        (await this.prisma.user.count({ where: { id: userId, ...PRIVILEGED_ACCOUNT } })) > 0
      ) {
        throw new ForbiddenException(
          'Tài khoản quản trị chỉ gắn được bởi người có quyền quản lý người dùng',
        );
      }
      await this.assertAccountFree(userId);
    } else {
      const roleCode = ROLE_FOR_TYPE[current.employeeType];
      const role = roleCode
        ? await this.prisma.role.findFirst({ where: { code: roleCode, deletedAt: null } })
        : null;
      const created = await this.users.create(
        {
          email: dto.loginEmail!,
          fullName: current.fullName,
          roleIds: role ? [role.id] : [],
          sendInvite: true,
        },
        actor.sub,
        actor.email,
        meta.ipAddress,
        meta.userAgent,
      );
      userId = created.id;
      inviteSent = created.inviteSent;
    }

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.employee.update({
        where: { id },
        data: { userId, updatedBy: actor.sub },
        include: EMPLOYEE_INCLUDE,
      });
      // One display name: an existing account (e.g. the bootstrap admin
      // "Quản trị viên") takes the employee's name, as update() keeps it.
      if (dto.userId) {
        await tx.user.update({
          where: { id: dto.userId },
          data: { fullName: row.fullName, updatedBy: actor.sub },
        });
      }
      return row;
    });
    await this.log('EMPLOYEE_ACCOUNT_LINKED', actor, id, meta, {
      userId,
      created: !dto.userId,
      ...(inviteSent !== null ? { inviteSent } : {}),
    });
    // inviteSent: null for an existing account (no invite), false when the
    // setup email could not be sent — the UI then offers a temporary password.
    return { ...this.format(updated), inviteSent };
  }

  /** Accounts that can be linked to an employee: not deactivated, not linked yet. */
  async linkableAccounts(actor: JwtPayload) {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        deactivatedAt: null,
        employees: { none: { deletedAt: null } },
        // Admin accounts are for user managers to link (linkAccount checks too).
        ...(actor.permissions.includes('user.update') ? {} : { NOT: PRIVILEGED_ACCOUNT }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
      orderBy: { fullName: 'asc' },
      take: 200,
    });
    return rows.map(({ userRoles, ...u }) => ({ ...u, roles: userRoles.map(ur => ur.role.code) }));
  }

  /**
   * Take back a terminated employee (a dentist returning to the clinic).
   * The login account is reactivated unless asked not to; a dentist profile
   * stays INACTIVE until "Cho hành nghề lại" on the dentist page, so their
   * schedule and services are reviewed before bookings resume.
   */
  async reinstate(id: string, dto: ReinstateEmployeeDto, actor: JwtPayload, meta: RequestMeta) {
    const current = await this.findOrThrow(id);
    // A5-12: a planned departure not reached yet is simply called off.
    if (current.employmentStatus !== 'TERMINATED' && current.terminationDate) {
      const updated = await this.prisma.employee.update({
        where: { id },
        data: { terminationDate: null, updatedBy: actor.sub },
        include: EMPLOYEE_INCLUDE,
      });
      await this.log('EMPLOYEE_TERMINATION_CANCELLED', actor, id, meta, {
        reason: dto.reason,
        previousTerminationDate: current.terminationDate.toISOString().slice(0, 10),
      });
      return this.format(updated);
    }
    if (current.employmentStatus !== 'TERMINATED') {
      throw new EmployeeValidationException('Chỉ khôi phục được nhân viên đã nghỉ việc');
    }
    const userId = current.userId;
    const reactivateAccount = dto.reactivateAccount !== false && Boolean(userId);
    // Reopening the login brings back its old password and roles (possibly
    // admin): that is a user-management act, not an HR one. Refuse outright
    // rather than silently reinstating only half.
    if (reactivateAccount && !actor.permissions.includes('user.deactivate')) {
      throw new ForbiddenException(
        'Kích hoạt lại tài khoản đăng nhập cần quyền quản lý người dùng (user.deactivate). ' +
          'Bỏ chọn "Kích hoạt lại tài khoản" để chỉ khôi phục hồ sơ nhân viên.',
      );
    }

    let accountReactivated = false;
    const updated = await this.prisma.$transaction(async tx => {
      if (reactivateAccount && userId) {
        const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
        if (user?.deactivatedAt) {
          // The unique index only covers active accounts, so the email may
          // have gone to someone else meanwhile.
          const taken = await tx.user.findFirst({
            where: {
              email: { equals: normalizeEmail(user.email), mode: 'insensitive' },
              id: { not: userId },
              deactivatedAt: null,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (taken) throw new EmailAlreadyExistsException(user.email);
          await tx.user.update({
            where: { id: userId },
            data: { deactivatedAt: null, status: 'ACTIVE', updatedBy: actor.sub },
          });
          accountReactivated = true;
        }
      }
      return tx.employee.update({
        where: { id },
        data: { employmentStatus: 'ACTIVE', terminationDate: null, updatedBy: actor.sub },
        include: EMPLOYEE_INCLUDE,
      });
    });

    await this.log('EMPLOYEE_REINSTATED', actor, id, meta, {
      reason: dto.reason,
      previousTerminationDate: current.terminationDate?.toISOString().slice(0, 10) ?? null,
      accountReactivated,
    });
    if (accountReactivated) {
      await this.audit.log({
        action: 'USER_REACTIVATED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'user',
        targetId: userId!,
        metadata: { via: 'employee_reinstated', employeeId: id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
    return this.format(updated);
  }

  /** BR-STAFF-002: turn an employee into a dentist. */
  async createDentistProfile(
    id: string,
    dto: CreateDentistProfileDto,
    actor: JwtPayload,
    meta: RequestMeta,
  ) {
    const current = await this.findOrThrow(id);
    if (current.employmentStatus !== 'ACTIVE') {
      throw new DentistProfileNotAllowedException('Only an active employee can become a dentist');
    }
    if (!current.userId) {
      throw new DentistProfileNotAllowedException(
        'Employee needs a login account before becoming a dentist',
      );
    }
    if (current.dentistProfile) {
      throw new StaffLinkConflictException('Employee already has a dentist profile');
    }
    const userId = current.userId;

    const profile = await this.prisma.$transaction(async tx => {
      if (await tx.dentistProfile.findUnique({ where: { userId } })) {
        throw new StaffLinkConflictException('This account already has a dentist profile');
      }
      if (dto.licenseNumber) await this.assertLicenseFree(tx, dto.licenseNumber);

      const dentistRole = await tx.role.findFirst({ where: { code: 'dentist', deletedAt: null } });
      if (!dentistRole) throw new DentistProfileNotAllowedException('Role "dentist" is missing');
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: dentistRole.id } },
        update: {},
        create: { userId, roleId: dentistRole.id, assignedBy: actor.sub },
      });

      const existing = await tx.dentistProfile.count();
      const created = await tx.dentistProfile.create({
        data: {
          employeeId: id,
          userId,
          licenseNumber: dto.licenseNumber?.trim() || null,
          licenseIssuedAt: dto.licenseIssuedAt ? toDateOnly(dto.licenseIssuedAt) : null,
          specialties: dto.specialties ?? [],
          calendarColor: dto.calendarColor ?? nextCalendarColor(existing),
          defaultSlotMinutes: dto.defaultSlotMinutes ?? 30,
          acceptsOnlineBooking: dto.acceptsOnlineBooking ?? false,
          acceptsNewPatients: dto.acceptsNewPatients ?? true,
          bio: dto.bio ?? null,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
      });
      await tx.employee.update({
        where: { id },
        data: { employeeType: 'DENTIST', updatedBy: actor.sub },
      });
      return created;
    });

    await this.log('DENTIST_PROFILE_CREATED', actor, id, meta, {
      dentistProfileId: profile.id,
      userId,
    });
    return profile;
  }

  private async findOrThrow(id: string): Promise<EmployeeRow> {
    const row = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row) throw new EmployeeNotFoundException(id);
    return row;
  }

  private async assertAccountFree(userId: string) {
    const linked = await this.prisma.employee.findFirst({ where: { userId, deletedAt: null } });
    if (linked) {
      throw new StaffLinkConflictException(`Account is already linked to employee ${linked.code}`);
    }
  }

  private async assertLicenseFree(tx: Prisma.TransactionClient, licenseNumber: string) {
    const taken = await tx.dentistProfile.findFirst({
      where: { licenseNumber: licenseNumber.trim(), deletedAt: null },
    });
    if (taken) throw new LicenseNumberTakenException(licenseNumber);
  }

  private async assertNotLastAdmin(tx: Prisma.TransactionClient, userId: string) {
    const isAdmin = await tx.userRole.findFirst({
      where: { userId, role: { code: 'clinic_admin' } },
    });
    if (!isAdmin) return;
    const otherAdmins = await tx.user.count({
      where: {
        id: { not: userId },
        status: 'ACTIVE',
        deactivatedAt: null,
        deletedAt: null,
        userRoles: { some: { role: { code: 'clinic_admin' } } },
      },
    });
    if (otherAdmins === 0) throw new LastAdminTerminationException();
  }

  private validateContact(dto: { phone?: string | null }) {
    if (dto.phone && !isValidVnPhone(dto.phone)) {
      throw new EmployeeValidationException('Invalid Vietnamese phone number');
    }
  }

  private validateDob(dob: string | null | undefined, hireDate: Date) {
    if (!dob) return;
    const date = toDateOnly(dob);
    if (date > clinicToday())
      throw new EmployeeValidationException('Date of birth is in the future');
    if (date >= hireDate)
      throw new EmployeeValidationException('Date of birth is after the hire date');
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
      targetType: 'employee',
      targetId,
      metadata,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private format(row: EmployeeRow) {
    return {
      id: row.id,
      code: row.code,
      fullName: row.fullName,
      dob: row.dob ? row.dob.toISOString().slice(0, 10) : null,
      gender: row.gender,
      phone: row.phone,
      email: row.email,
      address: row.address,
      employeeType: row.employeeType,
      hireDate: row.hireDate.toISOString().slice(0, 10),
      terminationDate: row.terminationDate ? row.terminationDate.toISOString().slice(0, 10) : null,
      employmentStatus: row.employmentStatus,
      notes: row.notes,
      account: row.user
        ? { id: row.user.id, email: row.user.email, status: row.user.status }
        : null,
      dentistProfile: row.dentistProfile,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
