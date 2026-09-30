import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { AuditService } from '../audit/audit.service';
import {
  CannotRemoveLastAdminException,
  EmailAlreadyExistsException,
} from '../common/exceptions/business-rule.exception';
import { UserResponse, UserListItem } from './dto/user-response.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { EmailService } from '../common/services/email.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { assertDentistHasNoOpenWork } from '../staff/staff-rules';
import { normalizeEmail } from '../common/email.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  private readonly argon2Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
    saltLength: 16,
  };

  // Mirrors AuthService.PASSWORD_RESET_TTL_MS — the setup link created here
  // is consumed by the same POST /auth/reset-password endpoint, so it needs
  // the same lifetime.
  private readonly ACCOUNT_SETUP_TTL_MS = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<UserListItem>> {
    const { q, status, roleId, pageSize = 20, cursor } = query;

    const where: Prisma.UserWhereInput = {};

    if (status === 'DEACTIVATED') {
      where.deactivatedAt = { not: null };
    } else if (status === 'ACTIVE') {
      where.deactivatedAt = null;
      where.status = 'ACTIVE';
    } else if (status === 'PENDING_SETUP') {
      where.deactivatedAt = null;
      where.status = 'PENDING_SETUP';
    }

    if (roleId) {
      where.userRoles = {
        some: { roleId },
      };
    }

    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize + 1,
      include: {
        userRoles: {
          include: { role: true },
        },
        dentistProfile: { select: { deletedAt: true } },
      },
    });

    const hasMore = users.length > pageSize;
    const data = hasMore ? users.slice(0, pageSize) : users;

    return {
      data: data.map(user => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status.toLowerCase(),
        roles: user.userRoles.map(ur => ur.role.code),
        // A dentist role without a profile gets no colour, services or
        // online booking; the Users page asks for one to be created.
        hasDentistProfile: Boolean(user.dentistProfile && !user.dentistProfile.deletedAt),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        deactivatedAt: user.deactivatedAt,
      })),
      pagination: {
        pageSize,
        nextCursor:
          hasMore && data.length > 0 ? data[data.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  async getById(userId: string): Promise<UserResponse> {
    const user = await this.getUserWithRolesAndPermissions(userId);

    return this.mapToUserResponse(user);
  }

  async create(
    createUserDto: CreateUserDto,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<{
    id: string;
    email: string;
    status: string;
    createdAt: Date;
    /** False when no invite went out (opted out, or the email could not be sent). */
    inviteSent: boolean;
  }> {
    const email = normalizeEmail(createUserDto.email);
    // `email` uniqueness is enforced at the DB layer by a partial unique
    // index scoped to active rows only (deactivated_at IS NULL AND
    // deleted_at IS NULL — see migration 013_soft_delete_partial_unique).
    // Mirror that scope here so a deactivated user's old email is free to
    // reuse instead of throwing on a constraint the DB no longer enforces.
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deactivatedAt: null,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw new EmailAlreadyExistsException(email);
    }

    const roleIds = createUserDto.roleIds ?? [];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    if (roles.length !== roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    const tempPassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
    const passwordHash = await argon2.hash(tempPassword, this.argon2Options);

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: createUserDto.fullName,
        passwordHash,
        status: 'PENDING_SETUP',
        createdBy: actorUserId,
        userRoles: {
          create: roleIds.map(roleId => ({
            roleId,
            assignedBy: actorUserId,
          })),
        },
      },
    });

    await this.auditService.log({
      action: 'USER_CREATED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: user.id,
      ipAddress,
      userAgent,
      metadata: {
        email: user.email,
        fullName: user.fullName,
        roles: roles.map(r => r.code),
      },
    });

    // Not sending an invite would leave the account stuck: the temp password
    // above is random and never surfaced anywhere, so the setup link is the
    // only way in. Default to sending unless the caller opts out explicitly.
    // The result is reported back so the UI can offer a temporary password
    // instead of claiming an invite that never left the server.
    const inviteSent =
      createUserDto.sendInvite !== false && (await this.issuePasswordLink(user, 'setup'));
    if (createUserDto.sendInvite !== false && !inviteSent) {
      this.logger.warn(`Account setup email for ${user.email} was not sent`);
    }

    return {
      id: user.id,
      email: user.email,
      status: user.status.toLowerCase(),
      createdAt: user.createdAt,
      inviteSent,
    };
  }

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // login() gates on deactivatedAt (not status) — setting status=ACTIVE
    // here without clearing deactivatedAt leaves the user still locked out
    // while the UI shows them as active again.
    const reactivating = updateUserDto.status === 'ACTIVE' && user.deactivatedAt !== null;

    // Changing the login email: same active-row, case-insensitive
    // uniqueness as create() (and migration 037's lower(email) index).
    const newEmail =
      updateUserDto.email !== undefined ? normalizeEmail(updateUserDto.email) : undefined;
    const emailChanged = newEmail !== undefined && newEmail !== user.email;
    if (emailChanged) {
      const taken = await this.prisma.user.findFirst({
        where: {
          email: { equals: newEmail, mode: 'insensitive' },
          id: { not: userId },
          deactivatedAt: null,
          deletedAt: null,
        },
      });
      if (taken) throw new EmailAlreadyExistsException(newEmail);
    }
    const nameChanged =
      updateUserDto.fullName !== undefined && updateUserDto.fullName !== user.fullName;

    const updated = await this.prisma
      .$transaction(async tx => {
        const row = await tx.user.update({
          where: { id: userId },
          data: {
            fullName: updateUserDto.fullName ?? user.fullName,
            ...(emailChanged ? { email: newEmail } : {}),
            status: updateUserDto.status ?? user.status,
            deactivatedAt: reactivating ? null : user.deactivatedAt,
            updatedBy: actorUserId,
          },
          include: {
            userRoles: {
              include: {
                role: { include: { rolePermissions: { include: { permission: true } } } },
              },
            },
          },
        });
        // One display name: the linked employee record follows the account
        // (EmployeesService.update syncs the other way).
        if (nameChanged) {
          await tx.employee.updateMany({
            where: { userId, deletedAt: null },
            data: { fullName: row.fullName, updatedBy: actorUserId },
          });
        }
        return row;
      })
      .catch(error => {
        // Lost a race with another account taking the same email.
        if (
          emailChanged &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new EmailAlreadyExistsException(newEmail!);
        }
        throw error;
      });

    await this.auditService.log({
      action: 'USER_UPDATED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      metadata: {
        changes: updateUserDto,
        reactivated: reactivating,
        ...(emailChanged ? { emailFrom: user.email, emailTo: newEmail } : {}),
      },
      ipAddress,
      userAgent,
    });

    return this.mapToUserResponse(updated);
  }

  async updateRoles(
    userId: string,
    updateRolesDto: UpdateUserRolesDto,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<UserResponse> {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const roles = await this.prisma.role.findMany({
      where: { id: { in: updateRolesDto.roleIds } },
    });

    if (roles.length !== updateRolesDto.roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    await this.prisma.$transaction(
      async tx => {
        // Guard check + write happen inside the SAME Serializable
        // transaction as the role change below, so Postgres detects the
        // read/write conflict if this races with another admin's
        // deactivate()/updateRoles() call — otherwise two concurrent
        // "demote the last two admins" requests can each read
        // adminCount=2, both pass, and leave zero admins.
        await this.checkLastAdminGuard(tx, userId, updateRolesDto.roleIds);
        if (userId === actorUserId) {
          await this.checkSelfAdminRemoval(tx, userId, updateRolesDto.roleIds);
        }
        // BR-STAFF-004: dropping the dentist role orphans their bookings and
        // open encounters just like suspending the dentist would.
        if (!roles.some(r => r.code === 'dentist')) {
          await this.assertNoOpenDentistWork(tx, userId);
        }

        await tx.userRole.deleteMany({
          where: { userId },
        });

        await tx.userRole.createMany({
          data: updateRolesDto.roleIds.map(roleId => ({
            userId,
            roleId,
            assignedBy: actorUserId,
          })),
        });

        // Sign the user out (their own admin included) so a dropped role
        // stops working at once instead of surviving the next refresh.
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const updated = await this.getUserWithRolesAndPermissions(userId);

    await this.auditService.log({
      action: 'USER_ROLE_CHANGED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      metadata: { newRoles: roles.map(r => r.code) },
      ipAddress,
      userAgent,
    });

    return this.mapToUserResponse(updated);
  }

  async deactivate(
    userId: string,
    reason: string | undefined,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await this.prisma.$transaction(
      async tx => {
        // See updateRoles() — same Serializable-transaction fix for the
        // last-admin race.
        await this.checkLastAdminGuardForDeactivation(tx, userId);
        await this.assertNoOpenDentistWork(tx, userId);

        await tx.user.update({
          where: { id: userId },
          data: {
            deactivatedAt: new Date(),
            status: 'DEACTIVATED',
            updatedBy: actorUserId,
          },
        });

        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.auditService.log({
      action: 'USER_DEACTIVATED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      metadata: { reason },
      ipAddress,
      userAgent,
    });
  }

  async reactivate(
    userId: string,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.assertEmailFreeForReactivation(user);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deactivatedAt: null,
        status: 'ACTIVE',
        updatedBy: actorUserId,
      },
    });

    await this.auditService.log({
      action: 'USER_REACTIVATED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      ipAddress,
      userAgent,
    });
  }

  async resetPassword(
    userId: string,
    sendEmail: boolean,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<{ temporaryPassword?: string; emailSent?: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const tempPassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
    const passwordHash = await argon2.hash(tempPassword, this.argon2Options);

    await this.prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          status: 'PENDING_SETUP',
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedBy: actorUserId,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.auditService.log({
      action: 'USER_PASSWORD_RESET_BY_ADMIN',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      ipAddress,
      userAgent,
    });

    // Emailing the temporary password itself would put a credential in the
    // inbox; send a link to choose a new one instead (the account is now
    // PENDING_SETUP, so it gets the setup email).
    if (sendEmail) {
      return { emailSent: await this.issuePasswordLink(user, 'setup') };
    }

    return { temporaryPassword: tempPassword };
  }

  /**
   * Emails a one-hour link to choose a password: the account-setup email for
   * an account that never had one, the reset email otherwise. Unlike
   * resetPassword() the current password keeps working until the link is used,
   * so an accidental click locks nobody out.
   */
  async sendPasswordLink(
    userId: string,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<{ sent: boolean; expiresInMinutes: number; kind: 'setup' | 'reset' }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.deactivatedAt) {
      throw new BadRequestException(
        'Tài khoản đã bị vô hiệu hóa; hãy kích hoạt lại trước khi gửi link',
      );
    }
    const kind = user.status === 'PENDING_SETUP' ? 'setup' : 'reset';
    const sent = await this.issuePasswordLink(user, kind);
    await this.auditService.log({
      action: 'USER_PASSWORD_LINK_SENT',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      ipAddress,
      userAgent,
      metadata: { kind, sent },
    });
    return { sent, expiresInMinutes: Math.round(this.ACCOUNT_SETUP_TTL_MS / 60000), kind };
  }

  /** Stores a one-hour reset token and emails its link; false if the email failed. */
  private async issuePasswordLink(
    user: { id: string; email: string },
    kind: 'setup' | 'reset',
  ): Promise<boolean> {
    const token = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + this.ACCOUNT_SETUP_TTL_MS),
      },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${baseUrl}/auth/reset-password?token=${token}`;
    const expiresInMinutes = Math.round(this.ACCOUNT_SETUP_TTL_MS / 60000);
    if (process.env.EMAIL_MOCK === 'true' || process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[EMAIL] Password ${kind} URL for ${user.email}: ${url}`);
    }
    return kind === 'setup'
      ? this.emailService.sendAccountSetupEmail(user.email, url, expiresInMinutes)
      : this.emailService.sendPasswordResetEmail(user.email, url, expiresInMinutes);
  }

  async getLoginHistory(userId: string, limit: number = 20, cursor?: string) {
    const loginActions = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT_ALL'];

    const where: Prisma.AuditLogWhereInput = {
      actorUserId: userId,
      action: { in: loginActions },
    };

    if (cursor) {
      where.occurredAt = { lt: new Date(cursor) };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      select: {
        occurredAt: true,
        action: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor =
      hasMore && data.length > 0 ? data[data.length - 1].occurredAt.toISOString() : null;

    return {
      data: data.map(log => ({
        occurredAt: log.occurredAt,
        action: log.action.toLowerCase(),
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
      })),
      pagination: {
        pageSize: limit,
        nextCursor,
        hasMore,
      },
    };
  }

  private async getUserWithRolesAndPermissions(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * A deactivated account's email may have been reused by a new account
   * meanwhile (the unique index only covers active rows) — say so instead
   * of failing on the index.
   */
  async assertEmailFreeForReactivation(
    user: { id: string; email: string },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const taken = await db.user.findFirst({
      where: {
        email: { equals: normalizeEmail(user.email), mode: 'insensitive' },
        id: { not: user.id },
        deactivatedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (taken) throw new EmailAlreadyExistsException(user.email);
  }

  /** An admin cannot drop their own clinic_admin role (they would lock themselves out). */
  private async checkSelfAdminRemoval(
    tx: Prisma.TransactionClient,
    userId: string,
    newRoleIds: string[],
  ): Promise<void> {
    const current = await tx.userRole.findFirst({
      where: { userId, role: { code: 'clinic_admin' } },
      select: { roleId: true },
    });
    if (current && !newRoleIds.includes(current.roleId)) {
      throw new BadRequestException('Không thể tự gỡ vai trò Quản trị của chính mình');
    }
  }

  /** Same BR-STAFF-004 rule as suspending a dentist in the staff module. */
  private async assertNoOpenDentistWork(tx: Prisma.TransactionClient, userId: string) {
    const isDentist = await tx.userRole.findFirst({
      where: { userId, role: { code: 'dentist' } },
      select: { userId: true },
    });
    if (isDentist) await assertDentistHasNoOpenWork(tx, userId);
  }

  private async checkLastAdminGuard(
    tx: Prisma.TransactionClient,
    userId: string,
    newRoleIds: string[],
  ): Promise<void> {
    const clinicAdminRole = await tx.role.findUnique({
      where: { code: 'clinic_admin' },
    });

    if (!clinicAdminRole) return;

    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    const hasCurrentAdminRole = user?.userRoles.some(ur => ur.role.code === 'clinic_admin');
    const willHaveAdminRole = newRoleIds.includes(clinicAdminRole.id);

    if (hasCurrentAdminRole && !willHaveAdminRole) {
      const adminCount = await tx.user.count({
        where: {
          deactivatedAt: null,
          userRoles: {
            some: { roleId: clinicAdminRole.id },
          },
        },
      });

      if (adminCount <= 1) {
        throw new CannotRemoveLastAdminException();
      }
    }
  }

  private async checkLastAdminGuardForDeactivation(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const clinicAdminRole = await tx.role.findUnique({
      where: { code: 'clinic_admin' },
    });

    if (!clinicAdminRole) return;

    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    const hasAdminRole = user?.userRoles.some(ur => ur.role.code === 'clinic_admin');

    if (hasAdminRole) {
      const adminCount = await tx.user.count({
        where: {
          id: { not: userId },
          deactivatedAt: null,
          userRoles: {
            some: { roleId: clinicAdminRole.id },
          },
        },
      });

      if (adminCount === 0) {
        throw new CannotRemoveLastAdminException();
      }
    }
  }

  private mapToUserResponse(user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: Array<{
      role: {
        code: string;
        rolePermissions: Array<{ permission: { code: string } }>;
      };
    }>;
  }): UserResponse {
    const roles = user.userRoles.map(ur => ur.role.code);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.code)),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status.toLowerCase(),
      roles,
      permissions,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
