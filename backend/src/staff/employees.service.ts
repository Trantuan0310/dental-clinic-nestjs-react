import { Injectable } from '@nestjs/common';
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
  TerminateEmployeeDto,
  UpdateEmployeeDto,
} from './dto/staff.dto';
import {
  DentistHasFutureAppointmentsException,
  DentistProfileNotAllowedException,
  EmployeeNotFoundException,
  EmployeeValidationException,
  LastAdminTerminationException,
  LicenseNumberTakenException,
  StaffLinkConflictException,
} from './staff.exceptions';
import {
  clinicToday,
  futureActiveAppointments,
  nextCalendarColor,
  toDateOnly,
} from './staff-rules';

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
    return this.format(updated);
  }

  /** BR-STAFF-004 / BR-STAFF-005. */
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

    const updated = await this.prisma.$transaction(
      async tx => {
        if (current.dentistProfile && current.userId) {
          const blocking = await futureActiveAppointments(tx, current.userId);
          if (blocking.length > 0) throw new DentistHasFutureAppointmentsException(blocking);
        }
        if (current.userId) await this.assertNotLastAdmin(tx, current.userId);

        const row = await tx.employee.update({
          where: { id },
          data: {
            employmentStatus: 'TERMINATED',
            terminationDate,
            updatedBy: actor.sub,
          },
          include: EMPLOYEE_INCLUDE,
        });
        if (current.dentistProfile) {
          await tx.dentistProfile.update({
            where: { employeeId: id },
            data: { practiceStatus: 'INACTIVE', updatedBy: actor.sub },
          });
        }
        if (current.userId) {
          await tx.user.update({
            where: { id: current.userId },
            data: { status: 'DEACTIVATED', deactivatedAt: new Date(), updatedBy: actor.sub },
          });
          await tx.refreshToken.updateMany({
            where: { userId: current.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.log('EMPLOYEE_TERMINATED', actor, id, meta, {
      reason: dto.reason,
      terminationDate: terminationDate.toISOString().slice(0, 10),
      accountDeactivated: Boolean(current.userId),
    });
    return this.format(updated);
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
    if (userId) {
      const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw new EmployeeValidationException(`User ${userId} not found`);
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
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { userId, updatedBy: actor.sub },
      include: EMPLOYEE_INCLUDE,
    });
    await this.log('EMPLOYEE_ACCOUNT_LINKED', actor, id, meta, {
      userId,
      created: !dto.userId,
    });
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
