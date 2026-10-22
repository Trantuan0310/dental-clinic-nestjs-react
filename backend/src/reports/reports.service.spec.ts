import { Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseService } from '../expense/expense.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import {
  REVENUE_INVOICE_STATUSES,
  REVENUE_INVOICE_WHERE,
  countsAsRevenue,
  revenueInvoiceSql,
  revenueInvoiceWhere,
  revenueRowsSql,
  signedPaymentAmount,
  voidReversalAmount,
} from './revenue-basis';

const D = (n: number) => new Prisma.Decimal(n);
const admin = { sub: 'admin-1', email: 'a@x', permissions: ['appointment.read.any'] };
const dentist = { sub: 'dentist-1', email: 'd@x', permissions: ['appointment.read.own'] };

describe('revenue basis (H7)', () => {
  it('counts issued invoices by issue date — never DRAFT, nor VOIDED unless issued first', () => {
    expect(REVENUE_INVOICE_STATUSES).toEqual(['ISSUED', 'PARTIAL', 'PAID']);
    expect(REVENUE_INVOICE_WHERE.OR).toEqual([
      { status: { in: ['ISSUED', 'PARTIAL', 'PAID'] } },
      { status: 'VOIDED', voidedAt: { not: null } },
    ]);
    const at = new Date('2026-09-10T03:00:00Z');
    expect(countsAsRevenue({ status: 'PAID', issuedAt: at, voidedAt: null })).toBe(true);
    expect(countsAsRevenue({ status: 'VOIDED', issuedAt: at, voidedAt: at })).toBe(true);
    expect(countsAsRevenue({ status: 'VOIDED', issuedAt: null, voidedAt: at })).toBe(false);
    expect(countsAsRevenue({ status: 'DRAFT', issuedAt: null, voidedAt: null })).toBe(false);
    const from = new Date('2026-09-01T00:00:00+07:00');
    const to = new Date('2026-09-30T23:59:59.999+07:00');
    expect(revenueInvoiceWhere(from, to)).toEqual({
      ...REVENUE_INVOICE_WHERE,
      issuedAt: { not: null, gte: from, lte: to },
    });
    const sql = revenueInvoiceSql('i', from, to);
    expect(sql.sql).toContain('i."issued_at" >=');
    expect(sql.values).toEqual(['ISSUED', 'PARTIAL', 'PAID', from, to]);
    expect(() => revenueInvoiceSql('i; DROP', from, to)).toThrow();
  });

  it('takes a void back on the void date: total less the refunds already counted (5.3)', () => {
    expect(voidReversalAmount({ total: D(500), refundedAmount: D(200) })).toBe(-300);
    expect(voidReversalAmount({ total: D(500), refundedAmount: D(0) })).toBe(-500);
    const from = new Date('2026-10-01T00:00:00+07:00');
    const to = new Date('2026-10-31T23:59:59.999+07:00');
    const sql = revenueRowsSql(from, to).sql;
    expect(sql).toContain('-(i."total" - i."refunded_amount")');
    expect(sql).toContain('i."voided_at" >=');
    // A refund on an invoice voided later still lowers its own month.
    expect(sql).toContain(`i."status"::text = 'VOIDED' AND i."voided_at" IS NOT NULL`);
  });

  it('signs refunds negative (H6 payments.kind = REFUND)', () => {
    expect(signedPaymentAmount({ amount: D(500), kind: 'PAYMENT' })).toBe(500);
    expect(signedPaymentAmount({ amount: D(200), kind: 'REFUND' })).toBe(-200);
  });
});

describe('ReportsService', () => {
  let prisma: PrismaMockShape;
  let service: ReportsService;
  const expense = { aggregateApproved: jest.fn().mockResolvedValue(0) };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ReportsService(
      prisma as unknown as PrismaService,
      expense as unknown as ExpenseService,
    );
    prisma.invoice.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } });
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.invoiceItem.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  describe('revenueReport', () => {
    it('sums issued invoices, nets refunds by payment date and fills every section', async () => {
      const issuedC = new Date('2026-09-04T03:00:00Z');
      const voidedC = new Date('2026-09-07T03:00:00Z');
      prisma.invoice.findMany
        .mockResolvedValueOnce([
          {
            status: 'PAID',
            subtotal: D(1_000_000),
            total: D(1_000_000),
            outstandingAmount: D(0),
            issuedAt: new Date('2026-08-31T17:30:00Z'), // 1/9 00:30 clinic time
            encounter: { dentistId: 'd1', dentist: { fullName: 'BS An' } },
          },
          {
            status: 'PARTIAL',
            subtotal: D(625_000),
            total: D(500_000),
            outstandingAmount: D(300_000),
            issuedAt: new Date('2026-09-10T03:00:00Z'),
            encounter: { dentistId: 'd2', dentist: { fullName: 'BS Bình' } },
          },
          // Issued, refunded in full, then voided — all in the range.
          {
            status: 'VOIDED',
            subtotal: D(300_000),
            total: D(300_000),
            outstandingAmount: D(0),
            issuedAt: issuedC,
            encounter: { dentistId: 'd2', dentist: { fullName: 'BS Bình' } },
          },
        ])
        // Voided in the range: C (nothing left to take back) and an August
        // invoice taken back on 15/9, never in August.
        .mockResolvedValueOnce([
          {
            total: D(300_000),
            refundedAmount: D(300_000),
            voidedAt: voidedC,
            encounter: { dentistId: 'd2', dentist: { fullName: 'BS Bình' } },
          },
          {
            total: D(250_000),
            refundedAmount: D(0),
            voidedAt: new Date('2026-09-15T03:00:00Z'),
            encounter: { dentistId: 'd1', dentist: { fullName: 'BS An' } },
          },
        ]);
      const counted = { issuedAt: new Date('2026-09-01T00:00:00Z'), voidedAt: null };
      prisma.payment.findMany.mockResolvedValue([
        {
          amount: D(1_000_000),
          kind: 'PAYMENT',
          method: 'CASH',
          paidAt: new Date('2026-09-01T02:00:00Z'),
          invoice: { status: 'PAID', ...counted, encounter: { dentistId: 'd1' } },
        },
        {
          amount: D(200_000),
          kind: 'PAYMENT',
          method: 'BANK_TRANSFER',
          paidAt: new Date('2026-09-10T04:00:00Z'),
          invoice: { status: 'PARTIAL', ...counted, encounter: { dentistId: 'd2' } },
        },
        {
          amount: D(100_000),
          kind: 'REFUND',
          method: 'CASH',
          paidAt: new Date('2026-09-20T04:00:00Z'),
          invoice: { status: 'PAID', ...counted, encounter: { dentistId: 'd1' } },
        },
        // C voided after a full refund: both receipts stay COMPLETED and net
        // to zero; the refund lowers revenue on its date, the void takes
        // back what is left (0).
        {
          amount: D(300_000),
          kind: 'PAYMENT',
          method: 'CASH',
          paidAt: new Date('2026-09-05T04:00:00Z'),
          invoice: {
            status: 'VOIDED',
            issuedAt: issuedC,
            voidedAt: voidedC,
            encounter: { dentistId: 'd2' },
          },
        },
        {
          amount: D(300_000),
          kind: 'REFUND',
          method: 'CASH',
          paidAt: new Date('2026-09-06T04:00:00Z'),
          invoice: {
            status: 'VOIDED',
            issuedAt: issuedC,
            voidedAt: voidedC,
            encounter: { dentistId: 'd2' },
          },
        },
      ]);
      // Same movements as the Dashboard's revenueByProcedure (5.4).
      prisma.$queryRaw.mockResolvedValue([{ service: 'Trám', total: 480_000.4, count: BigInt(1) }]);
      prisma.invoice.aggregate
        .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { total: D(70_000) } }) // drafts
        .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { total: D(9_000_000) } }); // voided

      const r = await service.revenueReport({
        from: '2026-09-01',
        to: '2026-09-30',
        dentistId: 'd1',
      });

      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(REVENUE_INVOICE_WHERE.OR);
      expect(where.issuedAt.gte).toEqual(new Date('2026-09-01T00:00:00+07:00'));
      expect(where.encounter).toEqual({ dentistId: 'd1' });
      const voidWhere = prisma.invoice.findMany.mock.calls[1][0].where;
      expect(voidWhere).toMatchObject({
        status: 'VOIDED',
        issuedAt: { not: null },
        voidedAt: { gte: new Date('2026-09-01T00:00:00+07:00') },
        encounter: { dentistId: 'd1' },
      });
      // dentistId reaches payments, services and the excluded boxes too.
      expect(prisma.payment.findMany.mock.calls[0][0].where.invoice.encounter).toEqual({
        dentistId: 'd1',
      });
      const sqlArgs = prisma.$queryRaw.mock.calls[0].slice(1);
      const values = sqlArgs.flatMap((v: { values?: unknown[] }) => v?.values ?? []);
      expect(values).toContain('d1');
      expect(prisma.invoice.aggregate.mock.calls[0][0].where.encounter).toEqual({
        dentistId: 'd1',
      });
      // "Excluded" voided = never counted: voided as a draft, or no void date.
      expect(prisma.invoice.aggregate.mock.calls[1][0].where.OR).toEqual([
        { issuedAt: null, createdAt: expect.any(Object) },
        { voidedAt: null, issuedAt: expect.any(Object) },
      ]);

      // Issued 1.8M − 400k refunded − 250k voided in the range.
      expect(r.totalInvoiced).toBe(1_150_000);
      expect(r.totalVoided).toBe(250_000);
      expect(r.totalDiscount).toBe(125_000);
      expect(r.totalCollected).toBe(1_100_000);
      expect(r.totalRefunded).toBe(400_000);
      expect(r.totalOutstanding).toBe(300_000);
      expect(r.invoiceCount).toBe(3);
      expect(r.byStatus.map(b => b.status)).toEqual(['PAID', 'PARTIAL']);
      expect(r.excluded).toEqual({
        draft: { count: 2, total: 70_000 },
        voided: { count: 1, total: 9_000_000 },
      });
      expect(r.byMonth).toEqual([
        { month: '2026-09', total: 1_150_000, paid: 1_100_000, count: 3 },
      ]);
      expect(r.byDentist.find(d => d.dentistId === 'd1')).toMatchObject({
        dentistName: 'BS An',
        revenue: 650_000,
        paid: 900_000,
      });
      expect(r.byDentist.find(d => d.dentistId === 'd2')).toMatchObject({ revenue: 500_000 });
      expect(r.byService).toEqual([{ service: 'Trám', total: 480_000, count: 1 }]);
      const cash = r.byPaymentMethod.find(m => m.method === 'CASH')!;
      expect(cash).toMatchObject({ amount: 900_000, count: 2 });
      expect(r.byPaymentMethod.reduce((a, m) => a + m.sharePct, 0)).toBeCloseTo(100, 0);
    });
  });

  describe('outstandingAging (A6-09)', () => {
    it('lists every open balance by default and buckets it by clinic days', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'i1',
          code: 'HD1',
          patient: { id: 'p', fullName: 'An', code: 'BN1', primaryPhone: '0900' },
          encounter: { startedAt: new Date('2026-09-30T02:00:00Z'), dentist: { fullName: 'BS' } },
          total: D(100),
          outstandingAmount: D(100),
          issuedAt: new Date('2026-09-30T16:30:00Z'), // 30/9 23:30 clinic time
        },
        {
          id: 'i2',
          code: 'HD2',
          patient: { id: 'p', fullName: 'An', code: 'BN1', primaryPhone: null },
          encounter: null,
          total: D(50),
          outstandingAmount: D(50),
          issuedAt: new Date('2026-06-01T03:00:00Z'),
        },
      ]);
      const now = new Date('2026-10-01T03:00:00Z');

      const rows = await service.outstandingAging({}, now);

      expect(prisma.invoice.findMany.mock.calls[0][0].where.issuedAt.lte).toEqual(
        new Date('2026-10-01T23:59:59.999+07:00'),
      );
      expect(rows.map(r => [r.daysOld, r.bucket])).toEqual([
        [1, 'D0_7'], // one clinic day, not 0 by UTC hours
        [122, 'D90_PLUS'],
      ]);
      expect(rows[0].patient.phone).toBe('0900');
    });
  });

  describe('dashboardKpis (A6-12)', () => {
    it('leaves cancellations out and counts patients only for visits they came to', async () => {
      prisma.appointment.findMany
        .mockResolvedValueOnce([
          { patientId: 'p1', startAt: new Date('2026-10-01T02:00:00Z'), status: 'COMPLETED' },
          { patientId: 'p2', startAt: new Date('2026-10-01T03:00:00Z'), status: 'CANCELLED' },
          { patientId: 'p3', startAt: new Date('2026-10-01T04:00:00Z'), status: 'NO_SHOW' },
          { patientId: 'p4', startAt: new Date('2026-10-01T05:00:00Z'), status: 'LEFT' },
        ])
        .mockResolvedValueOnce([]);
      // p1 came before (returning); p4's first visit is today (new).
      prisma.appointment.groupBy.mockResolvedValue([
        { patientId: 'p1', _min: { startAt: new Date('2026-01-01T02:00:00Z') } },
        { patientId: 'p4', _min: { startAt: new Date('2026-10-01T05:00:00Z') } },
      ]);

      const k = await service.dashboardKpis({ from: '2026-10-01', to: '2026-10-01' });

      expect(k.appointments).toMatchObject({ total: 3, arrived: 2, cancelled: 1 });
      expect(k.patients).toMatchObject({ total: 2, newCount: 1, returningCount: 1 });
      expect(prisma.appointment.groupBy.mock.calls[0][0].where.status).toEqual({
        in: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'LEFT'],
      });
    });
  });

  describe('appointmentStats (A6-12)', () => {
    const g = (status: string, source: string, visitKind: string, dentistId: string, n = 1) => ({
      status,
      source,
      visitKind,
      dentistId,
      _count: { _all: n },
    });

    it('counts by final status, source and dentist in the database, with the online funnel', async () => {
      prisma.appointment.groupBy
        .mockResolvedValueOnce([
          g('COMPLETED', 'ONLINE', 'BOOKED', 'd1'),
          g('NO_SHOW', 'PHONE', 'BOOKED', 'd1'),
          g('CANCELLED', 'PHONE', 'BOOKED', 'd1'),
          g('LEFT', 'WALK_IN', 'WALK_IN', 'd2'),
          g('SCHEDULED', 'PHONE', 'BOOKED', 'd2'),
        ])
        .mockResolvedValueOnce([{ source: 'PHONE', dentistId: 'd1', _count: { _all: 1 } }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'd1', fullName: 'BS An' },
        { id: 'd2', fullName: 'BS Bình' },
      ]);
      prisma.bookingRequest.groupBy.mockResolvedValue([
        { closeReason: null, _count: { _all: 2 } },
        { closeReason: 'SPAM', _count: { _all: 3 } },
        { closeReason: 'PATIENT_CANCELLED_VISIT', _count: { _all: 1 } },
        { closeReason: 'WITHDRAWN_ONLINE', _count: { _all: 1 } },
        { closeReason: 'DECLINED', _count: { _all: 1 } },
        { closeReason: 'ARRIVED_NO_VISIT', _count: { _all: 1 } },
      ]);
      prisma.bookingRequest.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);

      const s = await service.appointmentStats({ from: '2026-10-01', to: '2026-10-01' }, admin);

      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
      expect(s.summary).toMatchObject({
        total: 5,
        pending: 1,
        arrived: 2,
        completed: 1,
        left: 1,
        noShow: 1,
        cancelled: 1,
        cancelledAfterCheckIn: 1,
        walkIn: 1,
        online: 1,
      });
      expect(s.rates.noShowPct).toBeCloseTo(33.3, 1);
      expect(s.bySource.find(x => x.source === 'PHONE')).toMatchObject({
        total: 3,
        noShow: 1,
        cancelledAfterCheckIn: 1,
      });
      expect(s.byDentist.map(d => [d.dentistName, d.total])).toEqual([
        ['BS An', 3],
        ['BS Bình', 2],
      ]);
      // Junk left out; the patient's own cancellations apart from the clinic's.
      expect(s.onlineFunnel).toEqual({
        requests: 6,
        booked: 2,
        arrived: 2,
        patientCancelled: 2,
        declined: 1,
        expired: 0,
        spam: 3,
      });
      const arrivedWhere = prisma.bookingRequest.count.mock.calls[1][0].where;
      expect(JSON.stringify(arrivedWhere)).toContain('ARRIVED_NO_VISIT');
      expect(JSON.stringify(arrivedWhere)).toContain('SPAM');
    });

    it('limits a row-scoped dentist to their own calendar, ignoring dentistId', async () => {
      prisma.appointment.groupBy.mockResolvedValue([]);

      const s = await service.appointmentStats({ dentistId: 'd2' }, dentist);

      expect(prisma.appointment.groupBy.mock.calls[0][0].where.dentistId).toBe('dentist-1');
      expect(s.scope).toBe('own');
      expect(s.onlineFunnel).toBeNull();
      expect(prisma.bookingRequest.groupBy).not.toHaveBeenCalled();
    });

    it('refuses a reversed range or one longer than a year', async () => {
      await expect(
        service.appointmentStats({ from: '2026-10-02', to: '2026-10-01' }, admin),
      ).rejects.toThrow(/Từ ngày/);
      await expect(
        service.appointmentStats({ from: '2000-01-01', to: '2026-10-01' }, admin),
      ).rejects.toThrow(/tối đa 366 ngày/);
      await expect(service.revenueReport({ from: '2024-01-01', to: '2026-10-01' })).rejects.toThrow(
        /tối đa 366 ngày/,
      );
      expect(prisma.appointment.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('appointmentsByDay (A6-18)', () => {
    it('shows a dentist their own calendar only and keeps cancellations out of count', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        { startAt: new Date('2026-09-30T17:30:00Z'), status: 'CANCELLED' },
        { startAt: new Date('2026-10-01T02:00:00Z'), status: 'COMPLETED' },
      ]);

      const rows = await service.appointmentsByDay(
        { from: '2026-10-01', to: '2026-10-01' },
        dentist,
      );

      expect(prisma.appointment.findMany.mock.calls[0][0].where.dentistId).toBe('dentist-1');
      expect(rows).toEqual([{ date: '2026-10-01', count: 1, arrived: 1, noShow: 0, cancelled: 1 }]);
    });
  });

  it('financeSummary nets refunds out of income and adds payroll paid to spending (4.4)', async () => {
    prisma.payment.findMany.mockResolvedValue([
      { amount: D(300), kind: 'PAYMENT', method: 'CASH', paidAt: new Date(), invoice: null },
      { amount: D(100), kind: 'REFUND', method: 'CASH', paidAt: new Date(), invoice: null },
    ]);
    expense.aggregateApproved.mockResolvedValue(50);
    prisma.payrollLineItem.aggregate.mockResolvedValue({ _sum: { netPayVnd: D(40) } });
    await expect(service.financeSummary({ from: '2026-10-01', to: '2026-10-01' })).resolves.toEqual(
      {
        totalIncome: 200,
        totalExpense: 90,
        payrollPaid: 40,
      },
    );
    // By payment date; a PAID period stays paid once auto-locked; an
    // adjustment period (a copy of the original payslips) is not summed.
    expect(prisma.payrollLineItem.aggregate.mock.calls[0][0].where.period).toEqual({
      status: { in: ['PAID', 'LOCKED'] },
      paidAt: {
        gte: new Date('2026-10-01T00:00:00+07:00'),
        lte: new Date('2026-10-01T23:59:59.999+07:00'),
      },
      openedFromPeriodId: null,
    });
  });

  it('dashboard revenue takes a void back on its own date (5.3)', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.invoice.aggregate.mockImplementation(async ({ where }: any) =>
      where.voidedAt
        ? { _sum: { total: D(300), refundedAmount: D(100) } }
        : { _sum: { total: D(1000) } },
    );
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: D(100) } });

    const k = await service.dashboardKpis({ from: '2026-10-01', to: '2026-10-01' });

    // 1000 issued − 100 refunded − (300 − 100) voided.
    expect(k.treatmentRevenue.total).toBe(700);
    const voidWhere = prisma.invoice.aggregate.mock.calls
      .map((c: any[]) => c[0].where)
      .find((w: any) => w.voidedAt);
    expect(voidWhere).toMatchObject({ status: 'VOIDED', issuedAt: { not: null } });
  });
});
