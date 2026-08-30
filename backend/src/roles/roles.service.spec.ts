import { Test } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validRole, adminPayload } from '../../test/helpers';
import {
  CannotDeleteSystemRoleException,
  CannotDeleteRoleWithUsersException,
} from '../common/exceptions/business-rule.exception';
import { ConflictException } from '@nestjs/common';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  const adminActor = adminPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns roles with permissionCount and userCount', async () => {
      (prisma.role.findMany as jest.Mock).mockResolvedValue([
        {
          ...validRole(),
          rolePermissions: [
            { permission: { code: 'patient.read' } },
            { permission: { code: 'patient.write' } },
          ],
          userRoles: [{ id: 'ur-1' }],
        },
      ]);
      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0].permissionCount).toBe(2);
      expect(result[0].userCount).toBe(1);
      expect(result[0].permissions).toEqual(['patient.read', 'patient.write']);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when missing', async () => {
      (prisma.role.findUniqueOrThrow as jest.Mock).mockRejectedValue(new Error('not found'));
      await expect(service.getById('r-x')).rejects.toThrow();
    });

    it('returns role with permissions and users', async () => {
      (prisma.role.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...validRole(),
        rolePermissions: [{ permission: { code: 'patient.read' } }],
        userRoles: [],
      });
      const result = await service.getById('role-1');
      expect(result.permissions).toContain('patient.read');
    });
  });

  describe('create', () => {
    it('throws ConflictException when code already exists', async () => {
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(validRole());
      await expect(
        service.create(
          { code: 'admin', name: 'Admin' } as any,
          adminActor.sub,
          adminActor.email,
          null,
          null,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates role and assigns permissions, logs audit', async () => {
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'perm-1', code: 'patient.read' },
      ]);
      (prisma.role.create as jest.Mock).mockResolvedValue({
        ...validRole({ id: 'new-role' }),
        rolePermissions: [{ permission: { code: 'patient.read' } }],
        userRoles: [],
      });

      await service.create(
        { code: 'receptionist', name: 'Receptionist', permissionCodes: ['patient.read'] } as any,
        adminActor.sub,
        adminActor.email,
        null,
        null,
      );

      expect(prisma.role.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_CREATED' }));
    });
  });

  describe('delete', () => {
    it('throws CannotDeleteSystemRoleException when role is system', async () => {
      (prisma.role.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...validRole({ isSystem: true }),
        userRoles: [],
      });
      await expect(
        service.delete('role-sys', adminActor.sub, adminActor.email, null, null),
      ).rejects.toThrow(CannotDeleteSystemRoleException);
    });

    it('throws CannotDeleteRoleWithUsersException when users still assigned', async () => {
      (prisma.role.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...validRole({ isSystem: false }),
        userRoles: [{ id: 'ur-1' }, { id: 'ur-2' }],
      });
      (prisma.userRole.count as jest.Mock).mockResolvedValue(2);
      await expect(
        service.delete('role-1', adminActor.sub, adminActor.email, null, null),
      ).rejects.toThrow(CannotDeleteRoleWithUsersException);
    });

    it('soft-deletes role when conditions met', async () => {
      (prisma.role.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...validRole({ isSystem: false }),
        userRoles: [],
      });
      (prisma.userRole.count as jest.Mock).mockResolvedValue(0);
      (prisma.role.update as jest.Mock).mockResolvedValue({});

      await service.delete('role-1', adminActor.sub, adminActor.email, null, null);

      expect(prisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'role-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('getPermissions', () => {
    it('returns flat list of permission objects', async () => {
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: '1', code: 'patient.read', resource: 'patient', action: 'read', description: null },
        { id: '2', code: 'patient.write', resource: 'patient', action: 'write', description: null },
      ]);
      const result = await service.getPermissions();
      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('patient.read');
    });
  });
});
