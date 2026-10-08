import { PayrollPeriodStatus, Prisma } from '@prisma/client';
import { PayrollService } from './payroll.service';
import { PayrollEventListener } from './payroll.listener';
import {
  PayrollForbiddenException,
  PayrollStateException,
  PayrollValidationException,
} from './domain/exceptions';

/**
 * Round 4 payroll fixes: H2 (recompute keeps adjustments, scoped + retried),
 * H4 (who gets a payslip), H5 (commission on issued invoices, clawback),
 * no self-approval.
 */
const snapshot = {
  payrollCycle: 'MONTHLY',
  overtimeMultiplier: '1.5',
  bhxhPct: '0.08',
  bhytPct: '0.015',
  bhtnPct: '0.01',
  minGrossForBhxh: '4680000',
  probationSalaryPct: '0.85',
  taxBrackets: {
    personalDeductionVnd: 11_000_000,
    brackets: [{ thresholdVnd: null, rate: 0 }],
  },
};

const period = (over: Record<string, unknown> = {}) => ({
  id: 'p-sep',
  periodStart: new Date('2026-09-01'),
  periodEnd: new Date('2026-09-30'),
  status: PayrollPeriodStatus.DRAFT,
  openedFromPeriodId: null,
  configSnapshot: snapshot,
  ...over,
});

const comp = {
  id: 'comp-1',
  dentistId: 'd1',
  baseSalaryVnd: new Prisma.Decimal(30_000_000),
  commissionPct: new Prisma.Decimal(0.1),
  overtimeHourlyVnd: new Prisma.Decimal(0),
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
};

const fn = (value: unknown = []) => jest.fn().mockResolvedValue(value);

function makeTx(over: Record<string, Record<string, jest.Mock>> = {}) {
  const base: Record<string, Record<string, jest.Mock>> = {
    dentistCompensation: { findMany: fn([comp]) },
    invoice: { findMany: fn([]) },
    encounter: { findMany: fn([]) },
    workingSchedule: { findMany: fn([]) },
    shiftRegistration: { findMany: fn([]) },
    scheduleOverride: { findMany: fn([]) },
    timeOff: { findMany: fn([]) },
    clinicClosure: { findMany: fn([]) },
    employee: { findMany: fn([]) },
    user: { findMany: fn([{ id: 'd1', fullName: 'BS Một' }]) },
    payrollAdjustment: {
      findMany: fn([]),
      updateMany: fn({ count: 0 }),
      create: fn({}),
    },
    payrollEncounterDetail: {
      findMany: fn([]),
      deleteMany: fn({ count: 0 }),
      createMany: fn({ count: 0 }),
    },
    payrollLineItem: {
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: 'li-1', ...create })),
      deleteMany: fn({ count: 0 }),
    },
  };
  for (const [k, v] of Object.entries(over)) base[k] = { ...base[k], ...v };
  return base;
}

function makeService(tx: ReturnType<typeof makeTx>, p = period()) {
  const prisma: any = {
    payrollPeriod: { findUnique: fn(p), findFirst: fn(null) },
    payrollLineItem: { findFirst: fn(null) },
    dentistCompensation: { findUnique: fn(null) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const audit = { log: jest.fn() };
  return { service: new PayrollService(prisma, audit as any), prisma, audit };
}

describe('PayrollService.computePeriod — round 4', () => {
  it('H2: keeps (period, dentist) adjustments and upserts the line instead of deleting all', async () => {
    const tx = makeTx({
      payrollAdjustment: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.payrollPeriodId === 'p-sep' && where.dentistId === 'd1'
              ? [{ type: 'BONUS', amountVnd: new Prisma.Decimal(2_000_000), dentistId: 'd1' }]
              : [],
          ),
      },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');

    const upsert = tx.payrollLineItem.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({
      payrollPeriodId_dentistId: { payrollPeriodId: 'p-sep', dentistId: 'd1' },
    });
    expect(upsert.update.bonusVnd).toBe(2_000_000);
    expect(upsert.update.baseSalaryVnd).toBe(30_000_000);
    expect(upsert.update.grossPayVnd).toBe(32_000_000);
    expect(upsert.update.manuallyAdjusted).toBe(true);
    // Adjustments re-attached to the (stable) line, never deleted.
    expect(tx.payrollAdjustment.updateMany).toHaveBeenCalledWith({
      where: { payrollPeriodId: 'p-sep', dentistId: 'd1' },
      data: { payrollLineItemId: 'li-1' },
    });
    // Only lines without adjustments may be dropped.
    expect(tx.payrollLineItem.deleteMany.mock.calls[0][0].where.adjustments).toEqual({ none: {} });
  });

  it('H4: payslips for anyone with work in the period, whatever their account status', async () => {
    const tx = makeTx({
      dentistCompensation: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.dentistId ? (where.dentistId === 'd1' ? [comp] : []) : [{ dentistId: 'd1' }],
          ),
      },
      encounter: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.dentistId ? [] : [{ dentistId: 'd-pending-setup' }],
          ),
      },
      user: {
        findMany: fn([
          { id: 'd1', fullName: 'BS Một' },
          { id: 'd-pending-setup', fullName: 'BS Mới' },
        ]),
      },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');
    const userWhere = tx.user.findMany.mock.calls[0][0].where;
    expect(userWhere).toEqual({ id: { in: ['d1', 'd-pending-setup'] } });
    expect(JSON.stringify(userWhere)).not.toContain('ACTIVE');
  });

  it('H4: stops base salary at the termination date', async () => {
    const tx = makeTx({
      employee: { findMany: fn([{ userId: 'd1', terminationDate: new Date('2026-09-20') }]) },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');
    expect(tx.payrollLineItem.upsert.mock.calls[0][0].update.baseSalaryVnd).toBe(20_000_000);
  });

  it('H1/H5: commission on issued invoices of the clinic period, after discount, per invoice line', async () => {
    const tx = makeTx({
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          where.encounter?.dentistId === 'd1'
            ? [
                {
                  id: 'inv-1',
                  code: 'HD-1',
                  subtotal: new Prisma.Decimal(10_000_000),
                  total: new Prisma.Decimal(5_000_000), // 50% off
                  issuedAt: new Date('2026-09-30T10:00:00+07:00'),
                  encounter: {
                    id: 'enc-1',
                    startedAt: new Date('2026-09-30T09:00:00+07:00'),
                    closedAt: new Date('2026-09-30T09:45:00+07:00'),
                  },
                  items: [
                    {
                      id: 'it-1',
                      treatmentId: 't-1',
                      description: 'A',
                      lineTotal: new Prisma.Decimal(6_000_000),
                    },
                    {
                      id: 'it-2',
                      treatmentId: null,
                      description: 'B',
                      lineTotal: new Prisma.Decimal(4_000_000),
                    },
                  ],
                },
              ]
            : [],
        ),
      },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');

    const invWhere = tx.invoice.findMany.mock.calls.find(c => c[0].where.encounter)![0].where;
    expect(invWhere.status).toEqual({ in: ['ISSUED', 'PARTIAL', 'PAID'] });
    expect(invWhere.issuedAt).toEqual({
      gte: new Date('2026-09-01T00:00:00+07:00'),
      lt: new Date('2026-10-01T00:00:00+07:00'),
    });

    const line = tx.payrollLineItem.upsert.mock.calls[0][0].update;
    expect(line.totalRevenueVnd).toBe(5_000_000);
    expect(line.commissionVnd).toBe(500_000);
    expect(line.encountersCount).toBe(1);

    const details = tx.payrollEncounterDetail.createMany.mock.calls[0][0].data;
    expect(details.map((d: any) => [d.invoiceItemId, d.basisAmountVnd, d.commissionPct])).toEqual([
      ['it-1', 3_000_000, 0.1],
      ['it-2', 2_000_000, 0.1],
    ]);
    expect(details[1].treatmentId).toBeNull();
  });

  it('H5: an invoice voided after its period closed is clawed back once in the open period', async () => {
    const counted = [
      {
        invoiceId: 'inv-old',
        basisAmountVnd: new Prisma.Decimal(4_000_000),
        commissionPct: new Prisma.Decimal(0.1),
        period: { periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31') },
      },
    ];
    const tx = makeTx({
      payrollEncounterDetail: { findMany: fn(counted) },
      invoice: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) => (where.id ? [{ id: 'inv-old', code: 'HD-OLD' }] : [])),
      },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');

    const detailWhere = tx.payrollEncounterDetail.findMany.mock.calls[0][0].where;
    expect(detailWhere.period).toEqual({ status: { in: ['APPROVED', 'PAID', 'LOCKED'] } });
    expect(tx.payrollAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payrollPeriodId: 'p-sep',
        dentistId: 'd1',
        type: 'DEDUCTION',
        amountVnd: 400_000,
        sourceInvoiceId: 'inv-old',
        adjustedByUserId: null,
      }),
    });

    // Already clawed back → nothing more.
    tx.payrollAdjustment.create.mockClear();
    tx.payrollAdjustment.findMany.mockImplementation(({ where }: any) =>
      where.sourceInvoiceId
        ? [{ sourceInvoiceId: 'inv-old', amountVnd: new Prisma.Decimal(400_000) }]
        : [],
    );
    await service.computePeriod('p-sep', 'admin-1');
    expect(tx.payrollAdjustment.create).not.toHaveBeenCalled();
  });

  it('scoped recompute (listener) touches only that dentist and retries a serialization failure', async () => {
    const tx = makeTx();
    const { service, prisma, audit } = makeService(tx);
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2034' }))
      .mockImplementation(async (cb: any) => cb(tx));

    const r = await service.computePeriod('p-sep', null, { dentistIds: ['d1'] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(r.lineItems).toHaveLength(1);
    // No full candidate scan for a scoped run.
    expect(tx.workingSchedule.findMany.mock.calls.every(c => c[0].where.dentistId === 'd1')).toBe(
      true,
    );
    expect(tx.payrollLineItem.deleteMany.mock.calls[0][0].where.dentistId).toEqual({ in: [] });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('refuses to recompute an adjustment period (would pay it twice)', async () => {
    const { service } = makeService(makeTx(), period({ openedFromPeriodId: 'p-aug' }));
    await expect(service.computePeriod('p-sep', 'admin-1')).rejects.toThrow(PayrollStateException);
  });
});

describe('PayrollService — acting on your own pay (owner who also practises)', () => {
  /** `otherAdmins`: active users other than the actor holding the permission. */
  const setup = (otherAdmins: number, p = period({ status: 'REVIEWING' })) => {
    const ctx = makeService(makeTx(), p);
    ctx.prisma.user = { count: fn(otherAdmins) };
    ctx.prisma.payrollPeriod.updateMany = fn({ count: 1 });
    ctx.prisma.payrollPeriod.findUniqueOrThrow = fn({ id: 'p-sep', status: 'APPROVED' });
    ctx.prisma.dentistCompensation.findFirst = fn(null);
    ctx.prisma.dentistCompensation.create = jest
      .fn()
      .mockImplementation(({ data }: any) => ({ id: 'comp-new', ...data }));
    return ctx;
  };
  const selfAudits = (audit: { log: jest.Mock }) =>
    audit.log.mock.calls.filter(c => c[0].action === 'PAYROLL_SELF_APPROVED');

  it('approve: blocked while another admin can approve', async () => {
    const { service, prisma } = setup(1);
    prisma.payrollLineItem.findFirst.mockResolvedValue({ id: 'li-own', netPayVnd: 1 });
    await expect(
      service.approvePeriod('p-sep', 'owner', 'Chỉ có một quản trị viên'),
    ).rejects.toThrow(PayrollForbiddenException);
    expect(prisma.payrollPeriod.updateMany).not.toHaveBeenCalled();
    // The permission looked up is the one the action needs.
    expect(JSON.stringify(prisma.user.count.mock.calls[0][0].where)).toContain(
      'payroll.period.approve',
    );
  });

  it('approve: sole admin needs a reason, then it goes through with PAYROLL_SELF_APPROVED', async () => {
    const { service, prisma, audit } = setup(0);
    prisma.payrollLineItem.findFirst.mockResolvedValue({ id: 'li-own', netPayVnd: 25_000_000 });
    await expect(service.approvePeriod('p-sep', 'owner')).rejects.toThrow(
      PayrollValidationException,
    );
    await expect(service.approvePeriod('p-sep', 'owner', 'ngắn')).rejects.toThrow(
      PayrollValidationException,
    );
    expect(prisma.payrollPeriod.updateMany).not.toHaveBeenCalled();

    await service.approvePeriod('p-sep', 'owner', '  Phòng khám chỉ có một quản trị viên  ');
    expect(prisma.payrollPeriod.updateMany).toHaveBeenCalled();
    const [entry] = selfAudits(audit);
    expect(entry[0]).toMatchObject({
      actorUserId: 'owner',
      targetType: 'PAYROLL_PERIOD',
      targetId: 'p-sep',
      metadata: {
        operation: 'PERIOD_APPROVE',
        reason: 'Phòng khám chỉ có một quản trị viên',
        lineItemId: 'li-own',
      },
    });
  });

  it('approve: no own payslip → no reason needed, no self audit', async () => {
    const { service, audit } = setup(3);
    await service.approvePeriod('p-sep', 'admin');
    expect(selfAudits(audit)).toHaveLength(0);
  });

  it('own compensation: blocked with another admin, allowed alone with a reason', async () => {
    const dto = {
      dentistId: 'owner',
      effectiveFrom: '2026-09-01',
      baseSalaryVnd: 1,
      commissionPct: 0.1,
    };
    const blocked = setup(1);
    await expect(blocked.service.createCompensation(dto, 'owner')).rejects.toThrow(
      PayrollForbiddenException,
    );

    const alone = setup(0);
    await expect(alone.service.createCompensation(dto, 'owner')).rejects.toThrow(
      PayrollValidationException,
    );
    await alone.service.createCompensation(
      { ...dto, selfApprovalReason: 'Chủ phòng khám tự lập lương' },
      'owner',
    );
    expect(selfAudits(alone.audit)[0][0].metadata.operation).toBe('COMPENSATION_CREATE');
  });

  it('own adjustment: blocked with another admin, allowed alone with a reason', async () => {
    const own = { id: 'li', payrollPeriodId: 'p-sep', dentistId: 'owner' };
    const blocked = setup(1, period());
    blocked.prisma.payrollLineItem.findUnique = fn(own);
    await expect(
      blocked.service.addAdjustment(
        'p-sep',
        { lineItemId: 'li', type: 'BONUS', amountVnd: 1, reason: 'Thưởng tháng' },
        'owner',
        ['payroll.admin'],
      ),
    ).rejects.toThrow(PayrollForbiddenException);

    const alone = setup(0, period());
    alone.prisma.payrollLineItem.findUnique = fn(own);
    await expect(
      alone.service.addAdjustment(
        'p-sep',
        { lineItemId: 'li', type: 'BONUS', amountVnd: 1, reason: 'Thưởng tháng' },
        'owner',
        ['payroll.admin'],
      ),
    ).rejects.toThrow(PayrollValidationException);
    // The reason gate runs before any write.
    expect(alone.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PayrollEventListener — round 4', () => {
  const make = () => {
    const prisma: any = { invoice: { findUnique: jest.fn() } };
    const payroll: any = {
      findOpenPeriodFor: jest.fn(),
      computePeriod: jest.fn().mockResolvedValue({}),
    };
    return { listener: new PayrollEventListener(prisma, payroll), prisma, payroll };
  };

  it('encounter closed at 10:00 VN on the last day recomputes only that dentist', async () => {
    const { listener, payroll } = make();
    payroll.findOpenPeriodFor.mockResolvedValue({ id: 'p-sep' });
    await listener.handleEncounterClosed({
      encounterId: 'e',
      dentistId: 'd1',
      closedAt: new Date('2026-09-30T10:00:00+07:00'),
    });
    expect(payroll.computePeriod).toHaveBeenCalledWith('p-sep', null, { dentistIds: ['d1'] });
  });

  it('invoice voided: recomputes the dentist in the open period (clawback lands there)', async () => {
    const { listener, prisma, payroll } = make();
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv',
      status: 'VOIDED',
      issuedAt: new Date('2026-08-20T09:00:00+07:00'),
      voidedAt: new Date('2026-09-10T09:00:00+07:00'),
      encounter: { dentistId: 'd1' },
    });
    // August is closed (no open period for it); September is open.
    payroll.findOpenPeriodFor.mockImplementation(async (at: Date, fallback?: boolean) =>
      at.getUTCMonth() === 8 || fallback ? { id: 'p-sep' } : null,
    );
    await listener.handleInvoiceChanged({ invoiceId: 'inv' });
    expect(payroll.computePeriod).toHaveBeenCalledTimes(1);
    expect(payroll.computePeriod).toHaveBeenCalledWith('p-sep', null, { dentistIds: ['d1'] });
  });

  it('never throws into the emitter', async () => {
    const { listener, prisma } = make();
    prisma.invoice.findUnique.mockRejectedValue(new Error('db down'));
    await expect(listener.handleInvoiceChanged({ invoiceId: 'x' })).resolves.toBeUndefined();
  });
});
