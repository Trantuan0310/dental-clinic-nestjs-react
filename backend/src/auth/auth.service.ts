import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  InvalidCredentialsException,
  AccountLockedException,
  TokenReuseDetectedException,
  InvalidTokenException,
  PasswordTooWeakException,
} from '../common/exceptions/auth.exception';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
    roles: string[];
    permissions: string[];
  };
  refreshToken?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface LoginHistoryItem {
  occurredAt: Date;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly argon2Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
    saltLength: 16,
  };

  private readonly REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  private readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
  private readonly ACCESS_TOKEN_TTL_SEC = 15 * 60;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000;
  private readonly MAX_FAILED_ATTEMPTS = 5;

  private readonly COMMON_PASSWORDS = new Set([
    'password',
    '12345678',
    '123456789',
    'password123',
    'admin123',
    'letmein',
    'welcome1',
    'monkey',
    'dragon',
    'master',
    'login',
    'qwerty',
    'abc123',
    'admin',
    'iloveyou',
    'sunshine',
    'princess',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async login(
    loginDto: LoginDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<LoginResponse> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
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

    if (!user || user.deactivatedAt !== null) {
      // Run a dummy argon2 verify so this branch takes roughly the same time
      // as a real "user exists, wrong password" attempt — otherwise the
      // response-time gap leaks whether an email is registered.
      await this.verifyPassword(password, await this.getDummyHash());
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { reason: 'user_not_found_or_deactivated', email },
      });
      throw new InvalidCredentialsException();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        actorUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        userAgent,
        metadata: { reason: 'account_locked' },
      });
      throw new AccountLockedException(retryAfter);
    }

    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      // Atomic increment at the SQL level (UPDATE ... SET x = x + 1) so
      // concurrent failed attempts on the same account can't lose updates —
      // a read-then-write (user.failedLoginAttempts + 1 written back) lets
      // parallel requests all read the same stale count and each write "1",
      // never crossing MAX_FAILED_ATTEMPTS and bypassing lockout entirely.
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      const failedAttempts = updated.failedLoginAttempts;
      const lockedUntil =
        failedAttempts > this.MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + this.LOCKOUT_DURATION_MS)
          : null;

      if (lockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil },
        });
      }

      await this.auditService.log({
        action: 'LOGIN_FAILED',
        actorUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_password', attempts: failedAttempts },
      });

      if (lockedUntil) {
        const retryAfter = Math.ceil(this.LOCKOUT_DURATION_MS / 1000);
        throw new AccountLockedException(retryAfter);
      }

      throw new InvalidCredentialsException();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const roles = user.userRoles.map(ur => ur.role.code);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.code)),
      ),
    ];

    const accessToken = this.generateAccessToken(user.id, user.email, permissions);
    const refreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress,
      userAgent,
      metadata: { method: 'password' },
    });

    return {
      accessToken,
      accessTokenExpiresIn: this.ACCESS_TOKEN_TTL_SEC,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status.toLowerCase(),
        roles,
        permissions,
      },
      refreshToken,
    };
  }

  async refresh(request: Request): Promise<LoginResponse> {
    const ipAddress = request.ip || null;
    const userAgent = request.get('user-agent') || null;

    const user = await this.getUserFromRefreshToken(request);

    const roles = user.userRoles.map(ur => ur.role.code);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.code)),
      ),
    ];

    const accessToken = this.generateAccessToken(user.id, user.email, permissions);
    const refreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

    return {
      accessToken,
      accessTokenExpiresIn: this.ACCESS_TOKEN_TTL_SEC,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status.toLowerCase(),
        roles,
        permissions,
      },
      refreshToken,
    };
  }

  async logout(request: Request): Promise<void> {
    const cookieToken = this.extractRefreshTokenFromCookie(request);
    if (!cookieToken) return;

    const tokenHash = this.hashToken(cookieToken);
    // updateMany (not update) so an already-revoked or unknown cookie is a
    // harmless no-op instead of throwing — logout should never error.
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      action: 'LOGOUT_ALL',
      actorUserId: userId,
      ipAddress,
      userAgent,
    });
  }

  async getMe(userId: string): Promise<UserResponse> {
    const user = await this.getUserWithRolesAndPermissions(userId);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status.toLowerCase(),
      roles: user.userRoles.map(ur => ur.role.code),
      permissions: [
        ...new Set(
          user.userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.code)),
        ),
      ],
    };
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    const isCurrentValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new InvalidCredentialsException();
    }

    this.validatePasswordStrength(newPassword, user.email);

    const newPasswordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          actorEmailAtTime: user.email,
          action: 'PASSWORD_CHANGED',
          ipAddress,
          userAgent,
          occurredAt: new Date(),
        },
      });
    });
  }

  async forgotPassword(
    email: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      this.logger.debug(`Forgot password requested for non-existent email: ${email}`);
      return;
    }

    const resetToken = crypto.randomUUID();
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + this.PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;
    const expiresInMinutes = Math.round(this.PASSWORD_RESET_TTL_MS / 60000);

    if (process.env.EMAIL_MOCK === 'true' || process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[EMAIL] Password reset URL for ${email}: ${resetUrl}`);
    }

    await this.emailService.sendPasswordResetEmail(email, resetUrl, expiresInMinutes);

    await this.auditService.log({
      action: 'PASSWORD_RESET_REQUESTED',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress,
      userAgent,
      metadata: { email },
    });
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const { token, newPassword } = resetPasswordDto;
    const tokenHash = this.hashToken(token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      throw new InvalidTokenException('Invalid or expired token');
    }

    if (resetToken.usedAt) {
      throw new InvalidTokenException('Token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new InvalidTokenException('Token has expired');
    }

    const user = resetToken.user;
    this.validatePasswordStrength(newPassword, user.email);

    const newPasswordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          status: 'ACTIVE',
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorEmailAtTime: user.email,
          action: 'PASSWORD_RESET_DONE',
          ipAddress,
          userAgent,
          occurredAt: new Date(),
        },
      });
    });
  }

  async getLoginHistory(userId: string, limit: number = 20, cursor?: string) {
    const loginActions = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT_ALL'];

    const where: Record<string, unknown> = {
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

  private generateAccessToken(userId: string, email: string, permissions: string[]): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      permissions,
    });
  }

  private async createRefreshToken(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<string> {
    const token = crypto.randomUUID();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return token;
  }

  private async getUserFromRefreshToken(request: Request) {
    const ipAddress = request.ip || null;
    const userAgent = request.get('user-agent') || null;
    const cookieToken = this.extractRefreshTokenFromCookie(request);

    if (!cookieToken) {
      throw new InvalidTokenException('No refresh token provided');
    }

    const tokenHash = this.hashToken(cookieToken);

    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!refreshToken) {
      throw new InvalidTokenException('Invalid refresh token');
    }

    if (refreshToken.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: refreshToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditService.log({
        action: 'REFRESH_REUSE_DETECTED',
        actorUserId: refreshToken.userId,
        ipAddress,
        userAgent,
        metadata: { suspiciousTokenId: refreshToken.id },
      });

      throw new TokenReuseDetectedException();
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new InvalidTokenException('Refresh token has expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.getUserWithRolesAndPermissions(refreshToken.userId);

    return user;
  }

  private extractRefreshTokenFromCookie(request: Request): string | null {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.refreshToken || null;
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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, this.argon2Options);
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  // Lazily computed once per process and reused — gives the "user not
  // found" login branch a real argon2 hash to verify against, so its
  // timing matches a genuine wrong-password attempt.
  private dummyHashPromise: Promise<string> | null = null;
  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hashPassword('dummy-password-for-constant-time-login');
    }
    return this.dummyHashPromise;
  }

  private validatePasswordStrength(password: string, email: string): void {
    if (password.length < 8) {
      throw new PasswordTooWeakException('Password must be at least 8 characters');
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);

    if (!hasLetter || !hasDigit) {
      throw new PasswordTooWeakException('Password must contain at least 1 letter and 1 digit');
    }

    const emailLocalPart = email.split('@')[0].toLowerCase();
    if (emailLocalPart && password.toLowerCase().includes(emailLocalPart)) {
      throw new PasswordTooWeakException('Password cannot contain your email address');
    }

    if (this.COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new PasswordTooWeakException(
        'Password is too common. Please choose a stronger password',
      );
    }
  }
}
