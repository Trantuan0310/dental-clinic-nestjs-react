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
    // The period's status, re-read inside the compute transaction (PAY-06).
    payrollPeriod: { findUnique: fn({ status: 'DRAFT' }) },
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
    // The transaction client: the tx mocks first, else the outer ones (the
    // period re-read, compensation writes), plus the advisory lock calls.
    $transaction: jest.fn(async (cb: any) =>
      cb(
        new Proxy(
          { $executeRaw: fn(1), $executeRawUnsafe: fn(1) },
          {
            // Per model: the tx's methods over the outer ones.
            get: (locks: any, k: string) =>
              k in locks ? locks[k] : { ...prisma[k], ...(tx as any)[k] },
          },
        ),
      ),
    ),
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

  describe('H5: basis dropped after its period closed (void, refund) → settled in the open period', () => {
    // August (closed) paid 10% on two lines of HD-OLD: 3tr + 1tr = 400k.
    const counted = [
      { invoiceItemId: 'it-a', basis: 3_000_000 },
      { invoiceItemId: 'it-b', basis: 1_000_000 },
    ].map(r => ({
      invoiceId: 'inv-old',
      invoiceItemId: r.invoiceItemId,
      basisAmountVnd: new Prisma.Decimal(r.basis),
      commissionPct: new Prisma.Decimal(0.1),
      period: { periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31') },
    }));
    const oldInvoice = (over: Record<string, unknown>) => ({
      id: 'inv-old',
      code: 'HD-OLD',
      status: 'PAID',
      voidedAt: null,
      total: new Prisma.Decimal(4_000_000),
      items: [
        { id: 'it-a', lineTotal: new Prisma.Decimal(3_000_000) },
        { id: 'it-b', lineTotal: new Prisma.Decimal(1_000_000) },
      ],
      payments: [],
      ...over,
    });
    const setup = (inv: Record<string, unknown>, settled: unknown[] = []) => {
      const tx = makeTx({
        payrollEncounterDetail: { findMany: fn(counted) },
        invoice: {
          findMany: jest
            .fn()
            .mockImplementation(({ where }) => (where.id ? [oldInvoice(inv)] : [])),
        },
        payrollAdjustment: {
          findMany: jest
            .fn()
            .mockImplementation(({ where }: any) => (where.sourceInvoiceId ? settled : [])),
        },
      });
      return { tx, ...makeService(tx) };
    };

    it('voided: claws back all of it, once', async () => {
      const { tx, service } = setup({
        status: 'VOIDED',
        voidedAt: new Date('2026-09-10T09:00:00+07:00'),
      });
      await service.computePeriod('p-sep', 'admin-1');
      expect(tx.payrollEncounterDetail.findMany.mock.calls[0][0].where.period).toEqual({
        status: { in: ['APPROVED', 'PAID', 'LOCKED'] },
      });
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

      const again = setup({ status: 'VOIDED', voidedAt: new Date('2026-09-10T09:00:00+07:00') }, [
        { sourceInvoiceId: 'inv-old', type: 'DEDUCTION', amountVnd: new Prisma.Decimal(400_000) },
      ]);
      await again.service.computePeriod('p-sep', 'admin-1');
      expect(again.tx.payrollAdjustment.create).not.toHaveBeenCalled();
    });

    it('refunded 1tr in September: claws back 10% of it, filtered by the refund date', async () => {
      const { tx, service } = setup({
        refundedAmount: new Prisma.Decimal(1_000_000),
        payments: [{ amount: new Prisma.Decimal(1_000_000) }],
      });
      await service.computePeriod('p-sep', 'admin-1');
      const invCall = tx.invoice.findMany.mock.calls.find(c => c[0].where.id)![0];
      expect(invCall.select.payments.where).toEqual({
        kind: 'REFUND',
        status: 'COMPLETED',
        paidAt: { lt: new Date('2026-10-01T00:00:00+07:00') },
      });
      expect(tx.payrollAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'DEDUCTION', amountVnd: 100_000 }),
      });
    });

    it('refund cancelled after it was clawed back: the difference is paid back', async () => {
      const { tx, service } = setup({ payments: [] }, [
        { sourceInvoiceId: 'inv-old', type: 'DEDUCTION', amountVnd: new Prisma.Decimal(100_000) },
      ]);
      await service.computePeriod('p-sep', 'admin-1');
      expect(tx.payrollAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'BONUS', amountVnd: 100_000 }),
      });
    });
  });

  it('H5: a refund inside the period lowers that period basis (same split as the invoice)', async () => {
    const tx = makeTx({
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          where.encounter?.dentistId === 'd1'
            ? [
                {
                  id: 'inv-1',
                  code: 'HD-1',
                  subtotal: new Prisma.Decimal(3_000_000),
                  total: new Prisma.Decimal(3_000_000),
                  issuedAt: new Date('2026-09-05T10:00:00+07:00'),
                  encounter: {
                    id: 'enc-1',
                    startedAt: null,
                    closedAt: new Date('2026-09-05T09:00:00+07:00'),
                  },
                  items: [1, 2, 3].map(n => ({
                    id: `it-${n}`,
                    treatmentId: `t-${n}`,
                    description: `Răng ${n}`,
                    lineTotal: new Prisma.Decimal(1_000_000),
                  })),
                  payments: [{ amount: new Prisma.Decimal(1_000_000) }], // one tooth refunded
                },
              ]
            : [],
        ),
      },
    });
    const { service } = makeService(tx);
    await service.computePeriod('p-sep', 'admin-1');
    const line = tx.payrollLineItem.upsert.mock.calls[0][0].update;
    expect(line.totalRevenueVnd).toBe(2_000_000);
    expect(line.commissionVnd).toBe(200_000);
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

  it('refund: settles in the open period of the refund date, not only the issue period', async () => {
    const { listener, prisma, payroll } = make();
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv',
      status: 'PAID',
      issuedAt: new Date('2026-08-20T09:00:00+07:00'),
      voidedAt: null,
      encounter: { dentistId: 'd1' },
    });
    payroll.findOpenPeriodFor.mockImplementation(async (at: Date) =>
      at.getUTCMonth() === 9 ? { id: 'p-oct' } : null,
    );
    await listener.handleInvoiceChanged({
      invoiceId: 'inv',
      refundedAt: new Date('2026-10-02T09:00:00+07:00'),
    });
    expect(payroll.computePeriod).toHaveBeenCalledWith('p-oct', null, { dentistIds: ['d1'] });
  });

  it('does not recompute on a plain payment (basis is the issued invoice, not cash)', () => {
    const events = Reflect.getMetadata(
      'EVENT_LISTENER_METADATA',
      PayrollEventListener.prototype.handleInvoiceChanged,
    ) as Array<{ event: string }>;
    const names = events.map(e => e.event).sort();
    expect(names).toEqual([
      'invoice.issued',
      'invoice.payment_voided',
      'invoice.refunded',
      'invoice.voided',
    ]);
  });

  it('never throws into the emitter', async () => {
    const { listener, prisma } = make();
    prisma.invoice.findUnique.mockRejectedValue(new Error('db down'));
    await expect(listener.handleInvoiceChanged({ invoiceId: 'x' })).resolves.toBeUndefined();
  });
});

describe('PayrollService — audit 2026-09-14 follow-ups', () => {
  it('PAY-06: does not rewrite a period approved while the compute started', async () => {
    const tx = makeTx({ payrollPeriod: { findUnique: fn({ status: 'APPROVED' }) } });
    const { service } = makeService(tx);
    await expect(service.computePeriod('p-sep', 'admin-1')).rejects.toThrow(/APPROVED/);
    expect(tx.payrollLineItem.upsert).not.toHaveBeenCalled();
    expect(tx.payrollLineItem.deleteMany).not.toHaveBeenCalled();
  });

  describe('PAY-09: changing a pay term end date', () => {
    const setup = (next: unknown) => {
      const { service, prisma } = makeService(makeTx());
      prisma.dentistCompensation = {
        findUnique: fn({
          dentistId: 'd1',
          effectiveFrom: new Date('2026-09-01'),
          deletedAt: null,
        }),
        findFirst: fn(next),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data })),
      };
      return { service, prisma };
    };

    it('refuses an end date before the start', async () => {
      const { service, prisma } = setup(null);
      await expect(
        service.updateCompensation('c1', { effectiveTo: '2026-08-31' } as any, 'admin-1'),
      ).rejects.toThrow(/không được trước ngày bắt đầu/);
      expect(prisma.dentistCompensation.update).not.toHaveBeenCalled();
    });

    it('refuses an end date reaching into the next term, other terms only', async () => {
      const nextTerm = {
        id: 'c2',
        effectiveFrom: new Date('2026-10-01'),
        effectiveTo: null,
      };
      const { service, prisma } = setup(nextTerm);
      await expect(
        service.updateCompensation('c1', { effectiveTo: '2026-10-15' } as any, 'admin-1'),
      ).rejects.toThrow(/chế độ lương khác/);
      expect(prisma.dentistCompensation.findFirst.mock.calls[0][0].where.id).toEqual({
        not: 'c1',
      });
      expect(prisma.dentistCompensation.update).not.toHaveBeenCalled();
    });

    it('accepts an end date that stays clear of other terms', async () => {
      const { service, prisma } = setup(null);
      await service.updateCompensation('c1', { effectiveTo: '2026-09-30' } as any, 'admin-1');
      expect(prisma.dentistCompensation.update).toHaveBeenCalled();
    });
  });
});

describe('PayrollService — business flow review 2026-10-21 (section 4)', () => {
  afterEach(() => jest.useRealTimers());
  /** Clinic clock: 2026-09-30 is the last day of the September period. */
  const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ['nextTick'] });

  describe('4.2: lock / approve only after the period ended (clinic date)', () => {
    const setup = (p = period()) => {
      const ctx = makeService(makeTx(), p);
      ctx.prisma.payrollPeriod.updateMany = fn({ count: 1 });
      ctx.prisma.payrollPeriod.findUniqueOrThrow = fn({ ...p, status: 'REVIEWING' });
      return ctx;
    };

    it('refuses to lock on the last day of the period, allows it the next clinic day', async () => {
      at('2026-09-30T16:30:00Z'); // 23:30 on 30/09 in Vietnam
      const early = setup();
      await expect(early.service.lockPeriod('p-sep', 'admin')).rejects.toThrow(
        /chưa kết thúc \(đến hết ngày 30\/09\/2026\)/,
      );
      expect(early.prisma.payrollPeriod.updateMany).not.toHaveBeenCalled();

      at('2026-09-30T17:30:00Z'); // 00:30 on 01/10 in Vietnam, still 30/09 in UTC
      const onTime = setup();
      await onTime.service.lockPeriod('p-sep', 'admin');
      expect(onTime.prisma.payrollPeriod.updateMany).toHaveBeenCalled();
    });

    it('refuses to approve before the end as a 409', async () => {
      at('2026-09-25T03:00:00Z');
      const { service } = setup(period({ status: 'REVIEWING' }));
      await expect(service.approvePeriod('p-sep', 'admin')).rejects.toThrow(PayrollStateException);
    });

    it('recomputes the period before approving it', async () => {
      at('2026-10-02T03:00:00Z');
      const { service, prisma } = setup(period({ status: 'REVIEWING' }));
      const compute = jest.spyOn(service, 'computePeriod');
      await service.approvePeriod('p-sep', 'admin');
      expect(compute).toHaveBeenCalledWith('p-sep', 'admin');
      expect(compute.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.payrollPeriod.updateMany.mock.invocationCallOrder[0],
      );
    });

    it('does not recompute an adjustment period', async () => {
      at('2026-10-02T03:00:00Z');
      const { service, prisma } = setup(
        period({ status: 'REVIEWING', openedFromPeriodId: 'p-aug' }),
      );
      const compute = jest.spyOn(service, 'computePeriod');
      await service.approvePeriod('p-sep', 'admin');
      expect(compute).not.toHaveBeenCalled();
      expect(prisma.payrollPeriod.updateMany).toHaveBeenCalled();
    });
  });

  describe('4.3: changing pay mid-way', () => {
    const term = (over: Record<string, unknown> = {}) => ({
      id: 'c-old',
      dentistId: 'd1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null as Date | null,
      deletedAt: null,
      baseSalaryVnd: new Prisma.Decimal(30_000_000),
      commissionPct: new Prisma.Decimal(0.1),
      overtimeHourlyVnd: new Prisma.Decimal(0),
      ...over,
    });
    const setup = (current: unknown) => {
      const { service, prisma, audit } = makeService(makeTx());
      prisma.dentistCompensation = {
        findUnique: fn(current),
        findFirst: fn(null),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'c-new', ...data })),
      };
      return { service, prisma, audit };
    };

    it('a new term ends the open-ended one the day before, in the same transaction', async () => {
      const { service, prisma } = setup(null);
      prisma.dentistCompensation.findFirst
        .mockResolvedValueOnce(term()) // the open-ended term
        .mockResolvedValueOnce(null); // no overlap once it is ended
      const created = await service.createCompensation(
        {
          dentistId: 'd1',
          effectiveFrom: '2026-10-01',
          baseSalaryVnd: 32_000_000,
          commissionPct: 0.12,
        },
        'admin',
      );
      expect(prisma.dentistCompensation.findFirst.mock.calls[0][0].where).toEqual({
        dentistId: 'd1',
        deletedAt: null,
        effectiveTo: null,
        effectiveFrom: { lt: new Date('2026-10-01') },
      });
      expect(prisma.dentistCompensation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-old' },
          data: { effectiveTo: new Date('2026-09-30') },
        }),
      );
      expect(created.endedPrevious).toMatchObject({
        id: 'c-old',
        effectiveTo: new Date('2026-09-30'),
      });
      expect(prisma.dentistCompensation.create).toHaveBeenCalled();
    });

    it('refuses a new rate on a term already in force on past days', async () => {
      at('2026-10-02T03:00:00Z');
      const { service, prisma } = setup(term());
      await expect(
        service.updateCompensation('c-old', { commissionPct: 0.2 } as any, 'admin'),
      ).rejects.toThrow(/thêm chế độ mới/);
      await expect(
        service.updateCompensation('c-old', { baseSalaryVnd: 1 } as any, 'admin'),
      ).rejects.toThrow(PayrollStateException);
      expect(prisma.dentistCompensation.update).not.toHaveBeenCalled();

      // Same values (a full form sent back) and notes are fine.
      await service.updateCompensation(
        'c-old',
        { commissionPct: 0.1, baseSalaryVnd: 30_000_000, notes: 'HĐ mới' } as any,
        'admin',
      );
      expect(prisma.dentistCompensation.update).toHaveBeenCalled();
    });

    it('a term starting today or later can still be corrected', async () => {
      at('2026-10-02T03:00:00Z');
      const { service, prisma } = setup(term({ effectiveFrom: new Date('2026-10-02') }));
      await service.updateCompensation('c-old', { commissionPct: 0.2 } as any, 'admin');
      expect(prisma.dentistCompensation.update).toHaveBeenCalled();
    });

    it('stop ends the term on the clinic date instead of deleting it', async () => {
      at('2026-10-01T18:00:00Z'); // 02/10 01:00 in Vietnam
      const { service, prisma, audit } = setup(term());
      await service.softDeleteCompensation('c-old', 'admin');
      expect(prisma.dentistCompensation.update).toHaveBeenCalledWith({
        where: { id: 'c-old' },
        data: { effectiveTo: new Date('2026-10-02') },
      });
      expect(audit.log.mock.calls[0][0].action).toBe('COMPENSATION_ENDED');
    });

    it('stop removes a term not yet in force, refuses one already ended', async () => {
      at('2026-10-02T03:00:00Z');
      const future = setup(term({ effectiveFrom: new Date('2026-11-01') }));
      await future.service.softDeleteCompensation('c-old', 'admin');
      expect(future.prisma.dentistCompensation.update.mock.calls[0][0].data).toEqual({
        deletedAt: expect.any(Date),
      });

      const ended = setup(term({ effectiveTo: new Date('2026-09-30') }));
      await expect(ended.service.softDeleteCompensation('c-old', 'admin')).rejects.toThrow(
        /đã kết thúc ngày 30\/09\/2026/,
      );
      expect(ended.prisma.dentistCompensation.update).not.toHaveBeenCalled();
    });
  });

  it('4.6: claws back commission of a dentist with nothing else in the period', async () => {
    const created: unknown[] = [];
    const tx = makeTx({
      // Left the clinic: no pay terms, visits or schedules any more.
      dentistCompensation: { findMany: fn([]) },
      user: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.id.in.map((id: string) => ({ id, fullName: id })),
          ),
      },
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          where.id
            ? [
                {
                  id: 'inv-old',
                  code: 'HD-OLD',
                  status: 'VOIDED',
                  voidedAt: new Date('2026-09-10T09:00:00+07:00'),
                  total: new Prisma.Decimal(4_000_000),
                  items: [{ id: 'it-a', lineTotal: new Prisma.Decimal(4_000_000) }],
                  payments: [],
                },
              ]
            : where.OR
              ? [{ id: 'inv-old' }]
              : [],
        ),
      },
      payrollEncounterDetail: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          where.invoiceId?.in
            ? [{ lineItem: { dentistId: 'd-left' } }]
            : [
                {
                  invoiceId: 'inv-old',
                  invoiceItemId: 'it-a',
                  basisAmountVnd: new Prisma.Decimal(4_000_000),
                  commissionPct: new Prisma.Decimal(0.1),
                  period: {
                    periodStart: new Date('2026-08-01'),
                    periodEnd: new Date('2026-08-31'),
                  },
                },
              ],
        ),
      },
      payrollAdjustment: {
        create: jest.fn().mockImplementation(({ data }) => created.push(data)),
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.payrollPeriodId === 'p-sep' && where.dentistId === 'd-left' ? created : [],
          ),
      },
    });
    const { service } = makeService(tx);
    const result = await service.computePeriod('p-sep', 'admin-1');

    const changed = tx.invoice.findMany.mock.calls.find(c => c[0].where.OR)![0];
    expect(changed.where.OR[1]).toEqual({ refundedAmount: { gt: 0 } });
    expect(created).toEqual([
      expect.objectContaining({ dentistId: 'd-left', type: 'DEDUCTION', amountVnd: 400_000 }),
    ]);
    expect(result.lineItems.map(l => l.dentistId)).toEqual(['d-left']);
  });

  describe('adjustment period: differences only (no second payment)', () => {
    it('opens with every amount at 0, the original kept for reference', async () => {
      const tx = makeTx({
        payrollPeriod: { create: fn({ id: 'adj-1' }) },
        payrollLineItem: {
          findMany: fn([
            {
              id: 'li-aug',
              dentistId: 'd1',
              grossPayVnd: new Prisma.Decimal(20_000_000),
              taxTncnVnd: new Prisma.Decimal(500_000),
              bhxhVnd: new Prisma.Decimal(2_100_000),
              netPayVnd: new Prisma.Decimal(17_400_000),
            },
          ]),
          create: fn({}),
        },
      });
      const { service, prisma } = makeService(tx, period({ id: 'p-aug', status: 'PAID' }));
      prisma.payrollConfig = { findFirst: fn({ ...snapshot }) };
      await service.openAdjustmentPeriod('p-aug', 'admin', ['payroll.admin']);

      const { data } = tx.payrollLineItem.create.mock.calls[0][0];
      for (const k of [
        'baseSalaryVnd',
        'commissionVnd',
        'grossPayVnd',
        'taxTncnVnd',
        'netPayVnd',
      ]) {
        expect(data[k]).toBe(0);
      }
      expect(data.computationLog.adjustmentFor).toEqual({
        periodId: 'p-aug',
        lineItemId: 'li-aug',
        grossPayVnd: 20_000_000,
        taxTncnVnd: 500_000,
        bhxhVnd: 2_100_000,
        netPayVnd: 17_400_000,
      });
    });

    it('a bonus there pays the bonus less the extra tax/insurance it causes', async () => {
      const adj = period({ id: 'p-adj', openedFromPeriodId: 'p-aug' });
      const tx = makeTx({
        payrollPeriod: { findUnique: fn(adj) },
        payrollAdjustment: {
          create: fn({ id: 'a-1' }),
          findMany: fn([{ type: 'BONUS', amountVnd: new Prisma.Decimal(1_000_000) }]),
        },
        payrollLineItem: {
          findUnique: fn({ id: 'li-adj', payrollPeriodId: 'p-adj', dentistId: 'd1' }),
          // The original payslip: 20tr gross, BHXH 10.5% = 2.1tr, no tax.
          findFirst: fn({
            grossPayVnd: new Prisma.Decimal(20_000_000),
            taxTncnVnd: new Prisma.Decimal(0),
            bhxhVnd: new Prisma.Decimal(2_100_000),
          }),
          update: fn({}),
        },
      });
      const { service, prisma } = makeService(tx, adj);
      prisma.payrollLineItem.findUnique = fn({
        id: 'li-adj',
        payrollPeriodId: 'p-adj',
        dentistId: 'd1',
      });
      await service.addAdjustment(
        'p-adj',
        { lineItemId: 'li-adj', type: 'BONUS', amountVnd: 1_000_000, reason: 'Bù thiếu ca' },
        'admin',
        ['payroll.admin'],
      );

      expect(tx.payrollLineItem.findFirst.mock.calls[0][0].where).toEqual({
        payrollPeriodId: 'p-aug',
        dentistId: 'd1',
      });
      expect(tx.payrollLineItem.update.mock.calls[0][0].data).toMatchObject({
        baseSalaryVnd: 0,
        commissionVnd: 0,
        grossPayVnd: 1_000_000,
        taxTncnVnd: 0,
        bhxhVnd: 105_000,
        netPayVnd: 895_000,
      });
    });
  });
});
