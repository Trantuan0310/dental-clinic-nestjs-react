import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AuditService } from '../audit/audit.service';
import {
  CannotDeleteSystemRoleException,
  CannotDeleteRoleWithUsersException,
} from '../common/exceptions/business-rule.exception';

export interface RoleResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  permissionCount: number;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        rolePermissions: { include: { permission: true } },
        userRoles: {
          where: { user: { deactivatedAt: null } },
        },
      },
    });

    return roles.map(role => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map(rp => rp.permission.code),
      permissionCount: role.rolePermissions.length,
      userCount: role.userRoles.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  async getById(roleId: string): Promise<RoleResponse> {
    const role = await this.getRoleWithRelations(roleId);

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map(rp => rp.permission.code),
      permissionCount: role.rolePermissions.length,
      userCount: role.userRoles.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async create(
    createRoleDto: CreateRoleDto,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<RoleResponse> {
    const existing = await this.prisma.role.findUnique({
      where: { code: createRoleDto.code },
    });

    if (existing) {
      throw new ConflictException(`Role with code '${createRoleDto.code}' already exists`);
    }

    const permissions = createRoleDto.permissionCodes?.length
      ? await this.prisma.permission.findMany({
          where: { code: { in: createRoleDto.permissionCodes } },
        })
      : [];

    if (
      createRoleDto.permissionCodes &&
      permissions.length !== createRoleDto.permissionCodes.length
    ) {
      throw new NotFoundException('One or more permissions not found');
    }

    const role = await this.prisma.role.create({
      data: {
        code: createRoleDto.code,
        name: createRoleDto.name,
        description: createRoleDto.description,
        isSystem: false,
        createdBy: actorUserId,
        rolePermissions: {
          create: permissions.map(p => ({
            permissionId: p.id,
          })),
        },
      },
      include: {
        rolePermissions: { include: { permission: true } },
        userRoles: true,
      },
    });

    await this.auditService.log({
      action: 'ROLE_CREATED',
      actorUserId,
      actorEmail,
      targetType: 'role',
      targetId: role.id,
      metadata: {
        code: role.code,
        name: role.name,
        permissions: permissions.map(p => p.code),
      },
      ipAddress,
      userAgent,
    });

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map(rp => rp.permission.code),
      permissionCount: role.rolePermissions.length,
      userCount: role.userRoles.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async update(
    roleId: string,
    updateRoleDto: UpdateRoleDto,
    actorUserId: string,
    actorEmail: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<RoleResponse> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { rolePermissions: true, userRoles: true },
    });

    const newPermissionCodes: string[] = updateRoleDto.permissionCodes ?? [];

    if (newPermissionCodes.length > 0) {
      const foundPerms = await this.prisma.permission.findMany({
        where: { code: { in: newPermissionCodes } },
      });
      if (foundPerms.length !== newPermissionCodes.length) {
        throw new NotFoundException('One or more permissions not found');
      }

      await this.prisma.$transaction(async tx => {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: foundPerms.map(p => ({
            roleId,
            permissionId: p.id,
          })),
        });
        await tx.role.update({
          where: { id: roleId },
          data: {
            name: updateRoleDto.name ?? role.name,
            description: updateRoleDto.description ?? role.description,
          },
        });
      });

      await this.auditService.log({
        action: 'ROLE_PERMISSIONS_CHANGED',
        actorUserId,
        actorEmail,
        targetType: 'role',
        targetId: roleId,
        metadata: { newPermissions: foundPerms.map(p => p.code) },
        ipAddress,
        userAgent,
      });
    } else {
      await this.prisma.role.update({
        where: { id: roleId },
        data: {
          name: updateRoleDto.name ?? role.name,
          description: updateRoleDto.description ?? role.description,
        },
      });
    }

    return this.getById(roleId);
  }

  async delete(
    roleId: string,
    _actorUserId: string,
    _actorEmail: string,
    _ipAddress: string | null,
    _userAgent: string | null,
  ): Promise<void> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: {
        userRoles: { where: { user: { deactivatedAt: null } } },
      },
    });

    if (role.isSystem) {
      throw new CannotDeleteSystemRoleException();
    }

    if (role.userRoles.length > 0) {
      throw new CannotDeleteRoleWithUsersException();
    }

    await this.prisma.role.update({
      where: { id: roleId },
      data: { deletedAt: new Date() },
    });
  }

  async getPermissions(): Promise<
    Array<{
      id: string;
      code: string;
      resource: string;
      action: string;
      description: string | null;
    }>
  > {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        code: true,
        resource: true,
        action: true,
        description: true,
      },
    });
  }

  private async getRoleWithRelations(roleId: string) {
    return this.prisma.role.findUniqueOrThrow({
      where: { id: roleId },
      include: {
        rolePermissions: { include: { permission: true } },
        userRoles: {
          where: { user: { deactivatedAt: null } },
        },
      },
    });
  }
}
