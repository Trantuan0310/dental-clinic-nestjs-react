import { NotFoundException } from '@nestjs/common';
import { InboxService } from './inbox.service';

const now = new Date('2026-10-28T03:00:00Z'); // 10:00 clinic time

function make() {
  const prisma: any = {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockImplementation(({ data }) => ({ count: data.length })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
    bookingRequest: { findMany: jest.fn().mockResolvedValue([]) },
    shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    recall: { count: jest.fn().mockResolvedValue(0) },
    inventoryItem: { count: jest.fn().mockResolvedValue(0), fields: { minStockLevel: 'f' } },
    encounter: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new InboxService(prisma), prisma };
}

describe('InboxService', () => {
  it("lists only the caller's notifications, unread filter and keyset page", async () => {
    const { service, prisma } = make();
    prisma.notification.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: `n${i}` })),
    );
    const page = await service.list('u1', { unreadOnly: true, cursor: 'n-prev' });
    const args = prisma.notification.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u1', readAt: null });
    expect(args).toMatchObject({ cursor: { id: 'n-prev' }, skip: 1, take: 21 });
    expect(page.data).toHaveLength(20);
    expect(page.nextCursor).toBe('n19');
  });

  it("marking read is scoped to the owner: someone else's id is not found", async () => {
    const { service, prisma } = make();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markRead('u1', 'other-users-id')).rejects.toThrow(NotFoundException);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      id: 'other-users-id',
      userId: 'u1',
    });
  });

  it('mark all read touches only unread rows of the caller', async () => {
    const { service, prisma } = make();
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 4 });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      readAt: null,
    });
  });

  it('a new booking request reaches each front-desk user once (dedupe key, skipDuplicates)', async () => {
    const { service, prisma } = make();
    prisma.bookingRequest.findMany.mockResolvedValue([
      {
        id: 'b1',
        fullName: 'Nguyễn Văn A',
        referenceCode: 'BK-1',
        requestedStartAt: new Date('2026-10-29T02:30:00Z'),
      },
    ]);
    const sent = await service.scanEvents(now);
    expect(sent).toBe(2);
    const { data, skipDuplicates } = prisma.notification.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.map((d: any) => [d.userId, d.dedupeKey, d.type])).toEqual([
      ['u1', 'booking:b1', 'bookingRequest'],
      ['u2', 'booking:b1', 'bookingRequest'],
    ]);
    expect(data[0].body).toContain('09:30 29/10/2026');
    // Recipients: active accounts holding the permission.
    const userWhere = prisma.user.findMany.mock.calls[0][0].where;
    expect(userWhere).toMatchObject({ deletedAt: null, deactivatedAt: null });
    expect(JSON.stringify(userWhere.AND)).toContain('booking_request.read');
    // Only events of the last day are scanned (no flood of old drafts on deploy).
    expect(prisma.invoice.findMany.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe(
      '2026-10-27T03:00:00.000Z',
    );
  });

  it('draft invoices go to those who can both read and issue them', async () => {
    const { service, prisma } = make();
    prisma.invoice.findMany.mockResolvedValue([
      { id: 'i1', code: 'INV-1', patient: { fullName: 'Lê B' } },
    ]);
    await service.scanEvents(now);
    const and = prisma.user.findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
    expect(JSON.stringify(and)).toContain('invoice.issue');
    expect(JSON.stringify(and)).toContain('invoice.read.any');
  });

  it('morning digest: open encounters to clinic-wide readers, and each dentist their own', async () => {
    const { service, prisma } = make();
    prisma.encounter.findMany.mockResolvedValue([
      { dentistId: 'd1' },
      { dentistId: 'd1' },
      { dentistId: 'd2' },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'admin' }]);
    await service.morningDigest(now);
    const calls = prisma.notification.createMany.mock.calls.map((c: any) => c[0].data);
    expect(calls.map((d: any[]) => [d[0].userId, d[0].title])).toEqual([
      ['admin', '3 phiên khám còn mở từ hôm trước'],
      ['d1', 'Bạn còn 2 phiên khám chưa đóng từ hôm trước'],
      ['d2', 'Bạn còn 1 phiên khám chưa đóng từ hôm trước'],
    ]);
    expect(calls[0][0].dedupeKey).toBe('digest:stale-encounters:2026-10-28');
  });

  it('nothing to report: no notification written', async () => {
    const { service, prisma } = make();
    await expect(service.morningDigest(now)).resolves.toBe(0);
    await expect(service.scanEvents(now)).resolves.toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
