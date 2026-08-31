import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
  ): Promise<{ id: string; email: string; status: string; createdAt: Date }> {
    // `email` is a GLOBAL unique constraint (schema.prisma: @@unique([email]),
    // not scoped to active users) — checking only active users here missed
    // deactivated users with the same email, so the later prisma.user.create()
    // hit the DB constraint directly and threw an uncaught Prisma error
    // instead of this intended 409.
    const existingUser = await this.prisma.user.findFirst({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new EmailAlreadyExistsException(createUserDto.email);
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
        email: createUserDto.email,
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

    if (createUserDto.sendInvite) {
      this.logger.log(
        `[MOCK EMAIL] Invite sent to ${user.email} with temp password: ${tempPassword}`,
      );
    }

    return {
      id: user.id,
      email: user.email,
      status: user.status.toLowerCase(),
      createdAt: user.createdAt,
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: updateUserDto.fullName ?? user.fullName,
        status: updateUserDto.status ?? user.status,
        deactivatedAt: reactivating ? null : user.deactivatedAt,
        updatedBy: actorUserId,
      },
      include: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });

    await this.auditService.log({
      action: 'USER_UPDATED',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      metadata: { changes: updateUserDto, reactivated: reactivating },
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
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

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
  ): Promise<{ temporaryPassword?: string }> {
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

    if (sendEmail) {
      this.logger.log(`[MOCK EMAIL] New password sent to ${user.email}`);
      return {};
    }

    return { temporaryPassword: tempPassword };
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
