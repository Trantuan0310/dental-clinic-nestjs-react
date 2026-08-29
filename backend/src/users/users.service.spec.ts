import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validUser, validRole, validUserRole, ACTION_AUDIT } from '../../test/helpers/fixtures';
import {
  CannotRemoveLastAdminException,
  EmailAlreadyExistsException,
} from '../common/exceptions/business-rule.exception';

jest.mock('argon2');

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    (argon2.hash as jest.Mock).mockResolvedValue('hashed-temp');

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns paginated user list with cursor', async () => {
      const users = [
        validUser({
          id: 'u1',
          email: 'a@x.com',
          createdAt: new Date('2026-08-15'),
          userRoles: [{ ...validUserRole(), role: validRole() }],
        }),
        validUser({
          id: 'u2',
          email: 'b@x.com',
          createdAt: new Date('2026-08-14'),
          userRoles: [],
        }),
      ];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      const result = await service.list({ pageSize: 20 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('u1');
      expect(result.pagination.hasMore).toBe(false);
    });

    it('filters by status=DEACTIVATED by deactivatedAt not null', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      await service.list({ status: 'DEACTIVATED' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deactivatedAt: { not: null } }),
        }),
      );
    });

    it('searches by email or fullName case-insensitive', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      await service.list({ q: 'alice' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { email: { contains: 'alice', mode: 'insensitive' } },
              { fullName: { contains: 'alice', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('applies cursor pagination when provided', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      await service.list({ cursor: '2026-08-15T00:00:00.000Z' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: new Date('2026-08-15T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('sets nextCursor when there is more data', async () => {
      const users = Array.from({ length: 21 }, (_, i) =>
        validUser({ id: `u${i}`, createdAt: new Date(2026, 7, 15 - i) }),
      );
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      const result = await service.list({ pageSize: 20 });
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
    });
  });

  describe('getById', () => {
    it('returns mapped user response with roles + permissions', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        validUser({
          userRoles: [
            {
              ...validUserRole(),
              role: {
                ...validRole(),
                rolePermissions: [{ permission: { code: 'patient.read' } }],
              },
            },
          ],
        }),
      );
      const result = await service.getById('user-1');
      expect(result.permissions).toContain('patient.read');
      expect(result.roles).toContain('admin');
    });
  });

  describe('create', () => {
    it('throws EmailAlreadyExistsException when active user with email exists', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(validUser());
      await expect(
        service.create(
          { email: 'dup@x.com', fullName: 'Dup' },
          'admin-1',
          'admin@x.com',
          null,
          null,
        ),
      ).rejects.toThrow(EmailAlreadyExistsException);
    });

    it('throws NotFoundException when one or more roleIds not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.role.findMany as jest.Mock).mockResolvedValue([]);
      await expect(
        service.create(
          { email: 'new@x.com', fullName: 'New', roleIds: ['r1', 'r2'] },
          'admin-1',
          'admin@x.com',
          null,
          null,
        ),
      ).rejects.toThrow(/roles not found/);
    });

    it('creates user with PENDING_SETUP status, assigns roles, logs audit', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.role.findMany as jest.Mock).mockResolvedValue([validRole({ id: 'r1' })]);
      (prisma.user.create as jest.Mock).mockResolvedValue(
        validUser({ id: 'new-user', email: 'new@x.com', status: UserStatus.PENDING_SETUP }),
      );

      const result = await service.create(
        { email: 'new@x.com', fullName: 'New', roleIds: ['r1'] },
        'admin-1',
        'admin@x.com',
        '127.0.0.1',
        'jest',
      );

      expect(result.status).toBe('pending_setup');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: UserStatus.PENDING_SETUP,
            createdBy: 'admin-1',
            userRoles: { create: [{ roleId: 'r1', assignedBy: 'admin-1' }] },
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ACTION_AUDIT.USER_CREATED }),
      );
    });
  });

  describe('update', () => {
    it('updates user fields and preserves existing values when partial', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(validUser());
      (prisma.user.update as jest.Mock).mockResolvedValue(
        validUser({
          fullName: 'Updated Name',
          userRoles: [{ ...validUserRole(), role: { ...validRole(), rolePermissions: [] } }],
        }),
      );

      const result = await service.update(
        'user-1',
        { fullName: 'Updated Name' },
        'admin-1',
        'admin@x.com',
        null,
        null,
      );

      expect(result.fullName).toBe('Updated Name');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            fullName: 'Updated Name',
            updatedBy: 'admin-1',
          }),
        }),
      );
    });
  });

  describe('updateRoles', () => {
    it('replaces user roles atomically and revokes active refresh tokens', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(
          validUser({
            userRoles: [{ ...validUserRole(), role: validRole({ code: 'receptionist' }) }],
          }),
        )
        .mockResolvedValueOnce(
          validUser({
            userRoles: [
              {
                ...validUserRole(),
                role: {
                  ...validRole({ id: 'r-new' }),
                  rolePermissions: [],
                },
              },
            ],
          }),
        );
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(null); // skip last-admin check
      (prisma.role.findMany as jest.Mock).mockResolvedValue([validRole({ id: 'r-new' })]);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

      await service.updateRoles(
        'user-1',
        { roleIds: ['r-new'] },
        'admin-1',
        'admin@x.com',
        null,
        null,
      );

      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.userRole.createMany).toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ACTION_AUDIT.USER_ROLE_CHANGED }),
      );
    });

    it('throws CannotRemoveLastAdminException when removing the last clinic_admin', async () => {
      const adminRole = validRole({ code: 'clinic_admin' });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        validUser({
          userRoles: [{ ...validUserRole({ roleId: adminRole.id }), role: adminRole }],
        }),
      );
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(adminRole);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        validUser({
          userRoles: [{ ...validUserRole({ roleId: adminRole.id }), role: adminRole }],
        }),
      );
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.updateRoles(
          'user-1',
          { roleIds: ['r-other'] },
          'admin-1',
          'admin@x.com',
          null,
          null,
        ),
      ).rejects.toThrow(CannotRemoveLastAdminException);
    });
  });

  describe('deactivate', () => {
    it('sets deactivatedAt and revokes sessions atomically', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        validUser({
          userRoles: [{ ...validUserRole(), role: validRole({ code: 'receptionist' }) }],
        }),
      );
      (prisma.role.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

      await service.deactivate('user-1', 'left the company', 'admin-1', 'admin@x.com', null, null);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: UserStatus.DEACTIVATED }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ACTION_AUDIT.USER_DEACTIVATED,
          metadata: { reason: 'left the company' },
        }),
      );
    });
  });

  describe('reactivate', () => {
    it('clears deactivatedAt, sets status ACTIVE', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(validUser());
      (prisma.user.update as jest.Mock).mockResolvedValue(validUser());

      await service.reactivate('user-1', 'admin-1', 'admin@x.com', null, null);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deactivatedAt: null,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ACTION_AUDIT.USER_REACTIVATED }),
      );
    });
  });

  describe('resetPassword', () => {
    it('hashes temp password, updates user, revokes sessions, logs audit', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(validUser());
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.resetPassword(
        'user-1',
        false,
        'admin-1',
        'admin@x.com',
        null,
        null,
      );

      expect(result.temporaryPassword).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed-temp',
            status: UserStatus.PENDING_SETUP,
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ACTION_AUDIT.USER_PASSWORD_RESET_BY_ADMIN }),
      );
    });
  });

  describe('getLoginHistory', () => {
    it('queries login-related actions and supports cursor pagination', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await service.getLoginHistory('user-1', 10, '2026-08-15T00:00:00.000Z');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorUserId: 'user-1',
            action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT_ALL'] },
            occurredAt: { lt: new Date('2026-08-15T00:00:00.000Z') },
          }),
        }),
      );
    });
  });
});
