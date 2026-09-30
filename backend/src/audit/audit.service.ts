import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `tx`: the caller's open transaction. Pass it for every call made inside
   * `$transaction`, so the entry commits or rolls back with the change it
   * records, and a transaction holding an advisory lock never waits for a
   * second pooled connection (a pool full of lock waiters deadlocked it).
   */
  async log(
    params: {
      action: string;
      actorUserId?: string | null;
      actorEmail?: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).auditLog.create({
      data: {
        action: params.action,
        actorUserId: params.actorUserId ?? null,
        actorEmailAtTime: params.actorEmail ?? null,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: (params.metadata as object) ?? undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
