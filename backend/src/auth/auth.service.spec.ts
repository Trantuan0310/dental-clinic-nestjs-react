import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UserStatus } from '@prisma/client';
import { ACTION_AUDIT } from '../../test/helpers/fixtures';
const ActionAudit = ACTION_AUDIT;
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import {
  validUser,
  validRole,
  validUserRole,
  validRefreshToken,
} from '../../test/helpers/fixtures';
import {
  InvalidCredentialsException,
  AccountLockedException,
  PasswordTooWeakException,
  InvalidTokenException,
} from '../common/exceptions/auth.exception';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMockShape;
  let jwt: { sign: jest.Mock };
  let audit: { log: jest.Mock };
  let emailService: { send: jest.Mock; sendPasswordResetEmail: jest.Mock };

  const buildUserWithRoles = (overrides: Partial<any> = {}) => ({
    ...validUser(),
    deactivatedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    userRoles: [
      {
        ...validUserRole(),
        role: {
          ...validRole(),
          rolePermissions: [{ permission: { code: 'patient.read' } }],
        },
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    emailService = {
      send: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };

    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns access + refresh token for valid credentials', async () => {
      const user = buildUserWithRoles();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
      (prisma.user.update as jest.Mock).mockResolvedValue(user);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue(validRefreshToken());

      const result = await service.login(
        { email: 'test@example.com', password: 'GoodPass123!' },
        '127.0.0.1',
        'jest',
      );

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.roles).toContain('admin');
      expect(result.user.permissions).toContain('patient.read');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: 0 }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActionAudit.LOGIN_SUCCESS }),
      );
    });

    it('throws InvalidCredentialsException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }, null, null),
      ).rejects.toThrow(InvalidCredentialsException);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ActionAudit.LOGIN_FAILED,
          metadata: expect.objectContaining({ reason: 'user_not_found_or_deactivated' }),
        }),
      );
    });

    it('throws InvalidCredentialsException when user is deactivated', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUserWithRoles({ deactivatedAt: new Date() }),
      );

      await expect(
        service.login({ email: 'test@example.com', password: 'x' }, null, null),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it('throws AccountLockedException when lockedUntil > now', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUserWithRoles({ lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(
        service.login({ email: 'test@example.com', password: 'x' }, null, null),
      ).rejects.toThrow(AccountLockedException);
    });

    it('locks account after exceeding MAX_FAILED_ATTEMPTS', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUserWithRoles({ failedLoginAttempts: 5 }),
      );
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }, null, null),
      ).rejects.toThrow(AccountLockedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 6,
            lockedUntil: expect.any(Date) as unknown as Date,
          }),
        }),
      );
    });

    it('throws InvalidCredentialsException when password is wrong (no lockout yet)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUserWithRoles({ failedLoginAttempts: 0 }),
      );
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }, null, null),
      ).rejects.toThrow(InvalidCredentialsException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 1,
            lockedUntil: null,
          }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue(validRefreshToken());
      await service.logout('rt-1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });

  describe('logoutAll', () => {
    it('revokes all non-revoked refresh tokens for a user', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      await service.logoutAll('user-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
        }),
      );
    });
  });

  describe('getMe', () => {
    it('returns user profile with roles and permissions', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(buildUserWithRoles());
      const me = await service.getMe('user-1');
      expect(me.id).toBe('user-1');
      expect(me.permissions).toContain('patient.read');
    });
  });

  describe('changePassword', () => {
    it('updates password, revokes tokens, and writes audit log atomically', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser());
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

      await service.changePassword(
        'user-1',
        { currentPassword: 'OldPass123!', newPassword: 'NewPass123!' },
        '127.0.0.1',
        'jest',
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ passwordHash: 'hashed-password' }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: ActionAudit.PASSWORD_CHANGED }),
        }),
      );
    });

    it('throws InvalidCredentialsException when current password is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser());
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(
          'user-1',
          { currentPassword: 'wrong', newPassword: 'NewPass123!' },
          null,
          null,
        ),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it('throws PasswordTooWeakException for weak new password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser());

      await expect(
        service.changePassword(
          'user-1',
          { currentPassword: 'OldPass123!', newPassword: 'password' },
          null,
          null,
        ),
      ).rejects.toThrow(PasswordTooWeakException);
    });

    it('throws when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.changePassword(
          'user-1',
          { currentPassword: 'OldPass123!', newPassword: 'NewPass123!' },
          null,
          null,
        ),
      ).rejects.toThrow(InvalidCredentialsException);
    });
  });

  describe('forgotPassword', () => {
    it('does nothing when email not found (no information leak)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await service.forgotPassword('nobody@example.com', null, null);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('creates reset token and logs audit when email exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser());
      (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});

      await service.forgotPassword('test@example.com', '127.0.0.1', 'jest');

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActionAudit.PASSWORD_RESET_REQUESTED }),
      );
    });
  });

  describe('resetPassword', () => {
    it('throws InvalidTokenException when token not found', async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'NewPass123!' }, null, null),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('throws when token already used', async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: validUser(),
      });
      await expect(
        service.resetPassword({ token: 'x', newPassword: 'NewPass123!' }, null, null),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('throws when token expired', async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: validUser(),
      });
      await expect(
        service.resetPassword({ token: 'x', newPassword: 'NewPass123!' }, null, null),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('updates password, marks token used, revokes sessions atomically on success', async () => {
      const user = validUser({ status: UserStatus.ACTIVE });
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'prt-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

      await service.resetPassword(
        { token: 'good', newPassword: 'NewPass123!' },
        '127.0.0.1',
        'jest',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            passwordHash: 'hashed-password',
            status: UserStatus.ACTIVE,
          }),
        }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prt-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: ActionAudit.PASSWORD_RESET_DONE }),
        }),
      );
    });
  });

  describe('getLoginHistory', () => {
    it('queries only login-related actions and returns pagination cursor', async () => {
      const logs = [
        { occurredAt: new Date(), action: 'LOGIN_SUCCESS', ipAddress: '1.1.1.1', userAgent: 'a' },
        { occurredAt: new Date(), action: 'LOGIN_FAILED', ipAddress: '1.1.1.1', userAgent: 'a' },
      ];
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(logs);

      const result = await service.getLoginHistory('user-1', 20);
      expect(result.data).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(20);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorUserId: 'user-1',
            action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT_ALL'] },
          }),
        }),
      );
    });

    it('applies cursor pagination', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await service.getLoginHistory('user-1', 10, '2026-08-01T00:00:00.000Z');
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorUserId: 'user-1',
            occurredAt: { lt: new Date('2026-08-01T00:00:00.000Z') },
          }),
        }),
      );
    });
  });
});
