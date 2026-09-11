import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validAuditLog } from '../../test/helpers/fixtures';

describe('AuditController', () => {
  let controller: AuditController;
  let prisma: PrismaMockShape;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('list', () => {
    it('returns paginated audit logs', async () => {
      const logs = [validAuditLog({ id: 'l-1' }), validAuditLog({ id: 'l-2' })];
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(logs);

      const result = await controller.list({ limit: 20 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(20);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });

    it('returns nextCursor when more pages exist', async () => {
      const logs = Array.from({ length: 21 }, (_, i) => validAuditLog({ id: `l-${i}` }));
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(logs);

      const result = await controller.list({ limit: 20 } as any);

      expect(result.data).toHaveLength(20);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe('l-19');
    });

    it('applies filter by actor, action, targetType', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await controller.list({
        actor: 'u-1',
        action: 'USER_CREATED',
        targetType: 'user',
      } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorUserId: 'u-1',
            action: 'USER_CREATED',
            targetType: 'user',
          }),
        }),
      );
    });

    it('applies date range filter when from/to provided', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
      const from = '2025-01-01';
      const to = '2025-12-31';

      await controller.list({ from, to } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: expect.objectContaining({
              gte: new Date(from),
              // `to` is a bare date — the inclusive bound is end-of-day, not
              // midnight, or a same-day (from === to) query matches nothing.
              lte: new Date(`${to}T23:59:59.999Z`),
            }),
          }),
        }),
      );
    });

    it('a same-day range (from === to) covers the whole day, not a zero-width instant', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        { id: 'log-1', occurredAt: new Date('2026-09-10T18:30:00.000Z') },
      ]);

      const result = await controller.list({ from: '2026-09-10', to: '2026-09-10' } as any);

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.occurredAt.gte.getTime()).toBeLessThan(call.where.occurredAt.lte.getTime());
      expect(result.data).toHaveLength(1);
    });

    it('applies cursor-based pagination using occurredAt lt', async () => {
      (prisma.auditLog.findUnique as jest.Mock).mockResolvedValue({
        occurredAt: new Date('2025-06-15T10:00:00Z'),
      });
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await controller.list({ cursor: 'cursor-log' } as any);

      expect(prisma.auditLog.findUnique).toHaveBeenCalledWith({
        where: { id: 'cursor-log' },
        select: { occurredAt: true },
      });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurredAt: expect.objectContaining({ lt: new Date('2025-06-15T10:00:00Z') }),
          }),
        }),
      );
    });

    it('ignores invalid cursor (no log found) and continues', async () => {
      (prisma.auditLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await controller.list({ cursor: 'missing' } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalled();
    });
  });
});
