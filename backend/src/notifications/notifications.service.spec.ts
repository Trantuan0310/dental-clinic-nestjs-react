import { NotificationsService } from './notifications.service';

describe('NotificationsService.summary', () => {
  const now = new Date('2026-10-28T03:00:00Z'); // 10:00 clinic time
  const make = () => {
    const prisma: any = {
      shiftRegistration: { count: jest.fn().mockResolvedValue(2) },
      recall: { count: jest.fn().mockResolvedValue(5) },
      invoice: { count: jest.fn().mockResolvedValue(1) },
      encounter: { count: jest.fn().mockResolvedValue(3) },
      inventoryItem: {
        count: jest.fn().mockResolvedValue(4),
        fields: { minStockLevel: 'field:minStockLevel' },
      },
    };
    const booking: any = { pendingCount: jest.fn().mockResolvedValue({ count: 7 }) };
    return { service: new NotificationsService(prisma, booking), prisma, booking };
  };

  it('counts only what the caller may act on', async () => {
    const { service, prisma, booking } = make();
    const front = await service.summary(
      { sub: 'r1', permissions: ['booking_request.read', 'recall.read'] },
      now,
    );
    expect(front.items).toEqual([
      { key: 'bookingRequests', count: 7 },
      { key: 'recallsDue', count: 5 },
    ]);
    expect(front.total).toBe(12);
    expect(prisma.shiftRegistration.count).not.toHaveBeenCalled();
    expect(prisma.invoice.count).not.toHaveBeenCalled();
    expect(booking.pendingCount).toHaveBeenCalledTimes(1);
  });

  it("a dentist's open encounters from earlier days are their own only", async () => {
    const { service, prisma } = make();
    const res = await service.summary({ sub: 'd1', permissions: ['encounter.read.own'] }, now);
    expect(res.items).toEqual([{ key: 'staleEncounters', count: 3 }]);
    const { where } = prisma.encounter.count.mock.calls[0][0];
    expect(where).toMatchObject({ status: 'IN_PROGRESS', dentistId: 'd1' });
    expect(where.startedAt.lt.toISOString()).toBe('2026-10-27T17:00:00.000Z');
  });

  it('the clinic-wide reader sees every open encounter; low stock compares in the database', async () => {
    const { service, prisma } = make();
    await service.summary(
      { sub: 'a1', permissions: ['encounter.read.any', 'inventory.update'] },
      now,
    );
    expect(prisma.encounter.count.mock.calls[0][0].where.dentistId).toBeUndefined();
    expect(prisma.inventoryItem.count.mock.calls[0][0].where.quantityOnHand).toEqual({
      lte: 'field:minStockLevel',
    });
  });

  it('pending shifts from today on; recalls due by today', async () => {
    const { service, prisma } = make();
    await service.summary({ sub: 'a1', permissions: ['shift.approve', 'recall.read'] }, now);
    expect(prisma.shiftRegistration.count.mock.calls[0][0].where).toEqual({
      status: 'PENDING',
      deletedAt: null,
      date: { gte: new Date('2026-10-28') },
    });
    expect(prisma.recall.count.mock.calls[0][0].where.OR[0]).toEqual({
      status: 'PENDING',
      dueDate: { lte: new Date('2026-10-28') },
    });
  });
});
