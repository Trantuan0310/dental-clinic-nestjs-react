import { ReportsService } from './reports.service';

const RANGE = { from: '2026-01-01', to: '2026-02-28' };
const at = (iso: string) => new Date(iso);

describe('financial panels reconcile with report sources', () => {
  it('reconciles gross → revenue → collections → remaining without counting payroll twice', async () => {
    const prisma = {
      payrollLineItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { netPayVnd: 200 } }) },
    };
    const expense = { aggregateApproved: jest.fn().mockResolvedValue(300) };
    const service = new ReportsService(prisma as never, expense as never);
    jest.spyOn(service, 'revenueReport').mockResolvedValue({
      from: RANGE.from,
      to: RANGE.to,
      totalInvoiced: 800,
      totalCollected: 1100,
      totalAdjusted: 20,
      totalVoided: 30,
      grossIssued: 1000,
      issuedDiscount: 100,
      revenueRefunded: 50,
    } as never);
    const report = await service.financialWaterfall(RANGE);
    const step = (key: string) => report.steps.find(s => s.key === key)!;
    expect(step('refund').amount).toBe(-50);
    expect(step('void').to).toBe(report.netRevenue);
    expect(step('collectionBridge')).toMatchObject({ amount: 300, from: 800, to: 1100 });
    expect(step('expense').amount).toBe(-300);
    expect(step('payroll').to).toBe(600);
    expect(report.remaining).toBe(600);
    expect(step('remaining').to).toBe(report.remaining);
    expect(expense.aggregateApproved.mock.calls[0][0].toISOString()).toBe(
      '2025-12-31T17:00:00.000Z',
    );
    expect(prisma.payrollLineItem.aggregate.mock.calls[0][0].where.period.status.in).toEqual([
      'PAID',
      'LOCKED',
    ]);
  });

  it('reconstructs month-end debt using historical receipts and omits refund movements', async () => {
    const prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            total: 1000,
            issuedAt: at('2026-01-01T03:00:00Z'),
            voidedAt: null,
            payments: [{ amount: 400, paidAt: at('2026-02-01T03:00:00Z'), voidedAt: null }],
            adjustments: [],
          },
        ]),
      },
    };
    const service = new ReportsService(prisma as never, {} as never);
    const rows = await service.monthlyAging(RANGE);
    expect(rows.map(r => [r.month, r.total])).toEqual([
      ['2026-01', 1000],
      ['2026-02', 600],
    ]);
    expect(rows[0].asOf).toBe('2026-01-31T16:59:59.999Z');
    expect(rows[1].D31_60).toBe(600);
    expect(prisma.invoice.findMany.mock.calls[0][0].select.payments.where.kind).toBe('PAYMENT');
    expect(prisma.invoice.findMany.mock.calls[0][0].where.OR).toContainEqual({
      status: 'VOIDED',
      voidedAt: { not: null },
    });
  });

  it('stops the partial last month on the chosen day and never predicts future debt', async () => {
    jest.useFakeTimers().setSystemTime(at('2026-02-15T03:00:00Z'));
    try {
      const prisma = { invoice: { findMany: jest.fn().mockResolvedValue([]) } };
      const service = new ReportsService(prisma as never, {} as never);
      const rows = await service.monthlyAging(RANGE);
      expect(rows[1].asOf).toBe('2026-02-15T03:00:00.000Z');
      expect(await service.monthlyAging({ from: '2026-03-01', to: '2026-03-31' })).toEqual([]);
      expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
      await expect(
        service.monthlyAging({ from: '2025-01-01', to: '2026-03-01' }),
      ).rejects.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps zero-activity dentists and historical earners, with null acceptance when nothing was proposed', async () => {
    const prisma = {
      encounter: {
        groupBy: jest.fn().mockResolvedValue([{ dentistId: 'a', _count: { _all: 2 } }]),
      },
      treatmentPlan: {
        findMany: jest.fn().mockResolvedValue([
          { dentistId: 'a', acceptedAt: at('2026-02-01') },
          { dentistId: 'a', acceptedAt: null },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', fullName: 'A' },
          { id: 'b', fullName: 'B' },
          { id: 'old', fullName: 'Old' },
        ]),
      },
    };
    const service = new ReportsService(prisma as never, {} as never);
    jest
      .spyOn(service, 'revenueByDentist')
      .mockResolvedValue([
        { dentistId: 'old', dentistName: 'Old', revenue: -100, count: 0, percentage: 100 },
      ]);
    const rows = await service.dentistPanels(RANGE);
    expect(rows).toEqual([
      {
        dentistId: 'a',
        dentistName: 'A',
        revenue: 0,
        visits: 2,
        proposed: 2,
        accepted: 1,
        acceptancePct: 50,
      },
      {
        dentistId: 'b',
        dentistName: 'B',
        revenue: 0,
        visits: 0,
        proposed: 0,
        accepted: 0,
        acceptancePct: null,
      },
      {
        dentistId: 'old',
        dentistName: 'Old',
        revenue: -100,
        visits: 0,
        proposed: 0,
        accepted: 0,
        acceptancePct: null,
      },
    ]);
    expect(prisma.encounter.groupBy.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
  });
});
