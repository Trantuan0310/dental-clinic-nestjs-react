import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentStatus, InvoiceStatus, PaymentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseService } from '../expense/expense.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { isRowScoped } from '../common/row-scope';
import { clinicDateOnly, endOfClinicDay, startOfClinicDay } from '../common/date-range.util';
import {
  REVENUE_INVOICE_STATUSES,
  collectedPaymentWhere,
  revenueInvoiceWhere,
  revenueRefundWhere,
  revenueRowsSql,
  signedPaymentAmount,
} from './revenue-basis';

/** The patient came in (counted by the appointment's final status, never by audit events). */
export const ARRIVED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.LEFT,
];
const PENDING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: 'Khách vãng lai',
  PHONE: 'Qua điện thoại',
  ONLINE: 'Trực tuyến',
  RETURNING: 'Khách quay lại',
};

/** Booking requests closed because the patient came to the desk (FC, 044). */
const ARRIVED_CLOSE_REASONS = ['ARRIVED_WALK_IN', 'ARRIVED_NO_VISIT'];

export interface OnlineFunnel {
  /** Requests sent in the range, junk (SPAM) left out. */
  requests: number;
  booked: number;
  arrived: number;
  /** Withdrawn or cancelled by the patient (online or by phone). */
  patientCancelled: number;
  /** Declined by the clinic. */
  declined: number;
  expired: number;
  spam: number;
}

/** Aging buckets of an open balance, by whole clinic days since issue. */
export const AGING_BUCKETS = [
  { key: 'D0_7', label: 'Dưới 7 ngày', max: 7 },
  { key: 'D8_30', label: '8–30 ngày', max: 30 },
  { key: 'D31_60', label: '31–60 ngày', max: 60 },
  { key: 'D61_90', label: '61–90 ngày', max: 90 },
  { key: 'D90_PLUS', label: 'Trên 90 ngày', max: Infinity },
] as const;

const DAY_MS = 86_400_000;
/** Longest range a report reads in one call (a year, leap day included). */
export const MAX_RANGE_DAYS = 366;

interface CollectionRow {
  amount: Prisma.Decimal;
  kind: PaymentKind;
  method: string;
  paidAt: Date;
  invoice: { status: InvoiceStatus; encounter: { dentistId: string } | null } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);
const clinicMonth = (d: Date) => clinicDateOnly(d).slice(0, 7);

/**
 * Reports & Dashboard aggregates. Every revenue figure goes through
 * revenue-basis.ts (issued invoices by issuedAt; collections by paidAt net of
 * refunds) so the Reports page and the Dashboard always agree.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expense: ExpenseService,
  ) {}

  // ==========================================================================
  // Shared loaders
  // ==========================================================================

  private resolveRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
    // Clinic calendar boundaries are independent of the server's timezone.
    const toDate = endOfClinicDay(to ?? clinicDateOnly());
    let fromDate: Date;
    if (from) {
      fromDate = startOfClinicDay(from);
    } else {
      fromDate = startOfClinicDay(clinicDateOnly(toDate));
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    }
    this.assertRange(fromDate, toDate);
    return { fromDate, toDate };
  }

  /** From before to, at most MAX_RANGE_DAYS: a report never reads a whole table. */
  private assertRange(fromDate: Date, toDate: Date) {
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('"Từ ngày" phải trước hoặc bằng "Đến ngày".');
    }
    if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(
        'Khoảng thời gian tối đa ' +
          MAX_RANGE_DAYS +
          ' ngày. Hãy chọn khoảng ngắn hơn hoặc xem từng năm.',
      );
    }
  }

  /** The previous range of equal length immediately before [from, to]. */
  private previousRange(fromDate: Date, toDate: Date): { prevFrom: Date; prevTo: Date } {
    const lengthMs = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - lengthMs);
    return { prevFrom, prevTo };
  }

  private pctChange(current: number, previous: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  /** Payments and refunds dated in range; amounts signed (refund < 0). */
  private async loadCollections(
    from: Date,
    to: Date,
    invoice: Prisma.InvoiceWhereInput = {},
  ): Promise<Array<CollectionRow & { signed: number; refund: boolean; lowersRevenue: boolean }>> {
    const rows: CollectionRow[] = await this.prisma.payment.findMany({
      where: collectedPaymentWhere(from, to, invoice),
      select: {
        amount: true,
        kind: true,
        method: true,
        paidAt: true,
        invoice: { select: { status: true, encounter: { select: { dentistId: true } } } },
      },
    });
    return rows.map(r => {
      const refund = r.kind === PaymentKind.REFUND;
      return {
        ...r,
        signed: signedPaymentAmount(r),
        refund,
        // Same rule as revenueRefundWhere: not on a voided invoice.
        lowersRevenue: refund && !!r.invoice && REVENUE_INVOICE_STATUSES.includes(r.invoice.status),
      };
    });
  }

  /** Issued revenue minus refunds on counted invoices, both dated in range. */
  private async revenueTotal(from: Date, to: Date): Promise<number> {
    const [issued, refunds] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: revenueInvoiceWhere(from, to),
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: revenueRefundWhere(from, to),
      }),
    ]);
    return Number(issued._sum.total ?? 0) - Number(refunds._sum.amount ?? 0);
  }

  private async collectedTotal(from: Date, to: Date): Promise<number> {
    const rows = await this.loadCollections(from, to);
    return rows.reduce((acc, r) => acc + r.signed, 0);
  }

  // ==========================================================================
  // Reports page
  // ==========================================================================

  /**
   * BR-BILL-008 revenue report. Revenue = issued invoices by issue date;
   * "Đã thu" = payments by payment date net of refunds. DRAFT/VOIDED only in
   * `excluded`. `dentistId` filters every section.
   */
  async revenueReport(query: { from: string; to: string; dentistId?: string }) {
    const fromDate = startOfClinicDay(query.from);
    const toDate = endOfClinicDay(query.to);
    this.assertRange(fromDate, toDate);
    const byDentistFilter: Prisma.InvoiceWhereInput = query.dentistId
      ? { encounter: { dentistId: query.dentistId } }
      : {};
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      ...revenueInvoiceWhere(fromDate, toDate),
      ...byDentistFilter,
    };
    const inRange = { gte: fromDate, lte: toDate };

    const [invoices, items, collections, drafts, voided] = await Promise.all([
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          status: true,
          total: true,
          outstandingAmount: true,
          issuedAt: true,
          encounter: { select: { dentistId: true, dentist: { select: { fullName: true } } } },
        },
      }),
      this.prisma.invoiceItem.findMany({
        where: { deletedAt: null, invoice: invoiceWhere },
        select: {
          description: true,
          lineTotal: true,
          invoice: { select: { subtotal: true, total: true } },
        },
      }),
      this.loadCollections(fromDate, toDate, byDentistFilter),
      this.prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: InvoiceStatus.DRAFT,
          createdAt: inRange,
          ...byDentistFilter,
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: InvoiceStatus.VOIDED,
          OR: [{ issuedAt: inRange }, { issuedAt: null, createdAt: inRange }],
          ...byDentistFilter,
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    // Revenue = issued totals − refunds dated in the range (commission basis).
    const revenueRefunds = collections.filter(p => p.lowersRevenue);
    const totalInvoiced =
      invoices.reduce((acc, i) => acc + Number(i.total ?? 0), 0) +
      revenueRefunds.reduce((acc, p) => acc + p.signed, 0);
    const totalCollected = collections.reduce((acc, p) => acc + p.signed, 0);
    const totalRefunded = collections.filter(p => p.refund).reduce((a, p) => a - p.signed, 0);

    // Status split of the counted invoices.
    const statusMap = new Map<string, { count: number; total: number; outstanding: number }>();
    for (const inv of invoices) {
      const cur = statusMap.get(inv.status) ?? { count: 0, total: 0, outstanding: 0 };
      cur.count += 1;
      cur.total += Number(inv.total ?? 0);
      cur.outstanding += Number(inv.outstandingAmount ?? 0);
      statusMap.set(inv.status, cur);
    }

    // Months: revenue by issue month, collected by payment month.
    const monthMap = new Map<
      string,
      { month: string; total: number; paid: number; count: number }
    >();
    const month = (key: string) => {
      const cur = monthMap.get(key) ?? { month: key, total: 0, paid: 0, count: 0 };
      monthMap.set(key, cur);
      return cur;
    };
    for (const inv of invoices) {
      const m = month(clinicMonth(inv.issuedAt as Date));
      m.total += Number(inv.total ?? 0);
      m.count += 1;
    }
    for (const p of collections) month(clinicMonth(p.paidAt)).paid += p.signed;
    for (const p of revenueRefunds) month(clinicMonth(p.paidAt)).total += p.signed;

    // Dentists: revenue of their encounters' invoices, collected on them.
    const dentistMap = new Map<
      string,
      { dentistId: string; dentistName: string; revenue: number; paid: number; count: number }
    >();
    const dentist = (id: string, name?: string) => {
      const cur = dentistMap.get(id) ?? {
        dentistId: id,
        dentistName: name ?? 'Chưa rõ',
        revenue: 0,
        paid: 0,
        count: 0,
      };
      if (name) cur.dentistName = name;
      dentistMap.set(id, cur);
      return cur;
    };
    for (const inv of invoices) {
      const d = dentist(inv.encounter?.dentistId ?? 'unknown', inv.encounter?.dentist?.fullName);
      d.revenue += Number(inv.total ?? 0);
      d.count += 1;
    }
    for (const p of collections) {
      const d = dentist(p.invoice?.encounter?.dentistId ?? 'unknown');
      d.paid += p.signed;
      if (p.lowersRevenue) d.revenue += p.signed;
    }
    // A dentist only paid on older invoices still needs a name.
    const nameless = [...dentistMap.values()].filter(
      d => d.dentistName === 'Chưa rõ' && d.dentistId !== 'unknown',
    );
    if (nameless.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: nameless.map(d => d.dentistId) } },
        select: { id: true, fullName: true },
      });
      for (const u of users) dentist(u.id, u.fullName);
    }

    // Services: line totals after the invoice discount (pro rata).
    const serviceMap = new Map<string, { service: string; total: number; count: number }>();
    for (const it of items) {
      const key = it.description || 'Khác';
      const subtotal = Number(it.invoice?.subtotal ?? 0);
      const factor = subtotal > 0 ? Number(it.invoice?.total ?? 0) / subtotal : 1;
      const cur = serviceMap.get(key) ?? { service: key, total: 0, count: 0 };
      cur.total += Number(it.lineTotal ?? 0) * factor;
      cur.count += 1;
      serviceMap.set(key, cur);
    }

    // Payment methods: net of refunds, share of what was actually collected.
    const methodMap = new Map<string, { method: string; amount: number; count: number }>();
    for (const p of collections) {
      const cur = methodMap.get(p.method) ?? { method: p.method, amount: 0, count: 0 };
      cur.amount += p.signed;
      if (!p.refund) cur.count += 1;
      methodMap.set(p.method, cur);
    }

    return {
      from: query.from,
      to: query.to,
      dentistId: query.dentistId ?? null,
      basis: { revenue: 'issuedAt', collected: 'paidAt' } as const,
      totalInvoiced,
      totalCollected,
      totalRefunded,
      totalOutstanding: invoices.reduce((acc, i) => acc + Number(i.outstandingAmount ?? 0), 0),
      invoiceCount: invoices.length,
      byStatus: [...statusMap.entries()].map(([status, v]) => ({ status, ...v })),
      excluded: {
        draft: { count: drafts._count._all, total: Number(drafts._sum.total ?? 0) },
        voided: { count: voided._count._all, total: Number(voided._sum.total ?? 0) },
      },
      byMonth: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      byDentist: [...dentistMap.values()]
        .map(d => ({ ...d, sharePct: pct(d.revenue, totalInvoiced) }))
        .sort((a, b) => b.revenue - a.revenue),
      byService: [...serviceMap.values()]
        .map(s => ({ ...s, total: Math.round(s.total) }))
        .sort((a, b) => b.total - a.total),
      byPaymentMethod: [...methodMap.values()]
        .map(m => ({ ...m, sharePct: pct(m.amount, totalCollected) }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  /**
   * BR-BILL-009 open balances with their age bucket (A6-09): every open
   * balance by default, so front desk can chase new debt while it is easy.
   */
  async outstandingAging(query: { daysOutstanding?: number }, now: Date = new Date()) {
    const minDays = query.daysOutstanding ?? 0;
    const today = clinicDateOnly(now);
    // Day N ends at the end of the clinic day N days ago.
    const cutoff = endOfClinicDay(clinicDateOnly(new Date(now.getTime() - minDays * DAY_MS)));
    const rows = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        outstandingAmount: { gt: 0 },
        issuedAt: { not: null, lte: cutoff },
      },
      orderBy: { issuedAt: 'asc' },
      select: {
        id: true,
        code: true,
        patient: { select: { id: true, fullName: true, code: true, primaryPhone: true } },
        encounter: { select: { startedAt: true, dentist: { select: { fullName: true } } } },
        total: true,
        outstandingAmount: true,
        issuedAt: true,
      },
    });
    return rows.map(r => {
      const issuedDay = clinicDateOnly(r.issuedAt as Date);
      const daysOld = Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${issuedDay}T00:00:00Z`)) / DAY_MS,
      );
      const bucket = AGING_BUCKETS.find(b => daysOld <= b.max) ?? AGING_BUCKETS[4];
      return {
        id: r.id,
        code: r.code,
        patient: {
          id: r.patient.id,
          fullName: r.patient.fullName,
          code: r.patient.code,
          phone: r.patient.primaryPhone,
        },
        visitDate: r.encounter?.startedAt ?? null,
        dentistName: r.encounter?.dentist?.fullName ?? null,
        total: Number(r.total),
        outstanding: Number(r.outstandingAmount),
        issuedAt: r.issuedAt,
        daysOld,
        bucket: bucket.key,
        bucketLabel: bucket.label,
      };
    });
  }

  // ==========================================================================
  // Dashboard
  // ==========================================================================

  /**
   * KPI cards. Appointments exclude cancellations; patients and "new" count
   * only visits the patient actually came to (A6-12). Revenue/collected use
   * the shared revenue basis.
   */
  async dashboardKpis(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const { prevFrom, prevTo } = this.previousRange(fromDate, toDate);
    const appts = (gte: Date, lte: Date) =>
      this.prisma.appointment.findMany({
        where: { startAt: { gte, lte }, deletedAt: null },
        select: { patientId: true, startAt: true, status: true },
      });

    const [current, previous, revenue, prevRevenue, collected, prevCollected] = await Promise.all([
      appts(fromDate, toDate),
      appts(prevFrom, prevTo),
      this.revenueTotal(fromDate, toDate),
      this.revenueTotal(prevFrom, prevTo),
      this.collectedTotal(fromDate, toDate),
      this.collectedTotal(prevFrom, prevTo),
    ]);

    const arrived = (rows: typeof current) => rows.filter(a => ARRIVED_STATUSES.includes(a.status));
    const notCancelled = (rows: typeof current) =>
      rows.filter(a => a.status !== AppointmentStatus.CANCELLED).length;

    const arrivedNow = arrived(current);
    const patientIds = new Set(arrivedNow.map(a => a.patientId));
    const prevPatientIds = new Set(arrived(previous).map(a => a.patientId));

    // New = first visit the patient ever came to falls in range (a booking
    // they cancelled or missed earlier does not make them "returning").
    const firstVisits = patientIds.size
      ? await this.prisma.appointment.groupBy({
          by: ['patientId'],
          _min: { startAt: true },
          where: {
            patientId: { in: [...patientIds] },
            deletedAt: null,
            status: { in: ARRIVED_STATUSES },
          },
        })
      : [];
    const newCount = firstVisits.filter(r => r._min.startAt && r._min.startAt >= fromDate).length;

    const perDay = new Map<string, Set<string>>();
    for (const a of arrivedNow) {
      const day = clinicDateOnly(a.startAt);
      perDay.set(day, (perDay.get(day) ?? new Set()).add(a.patientId));
    }
    const sparkline = [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ids]) => ({ date, value: ids.size }));

    const apptTotal = notCancelled(current);
    const prevApptTotal = notCancelled(previous);

    return {
      patients: {
        total: patientIds.size,
        newCount,
        returningCount: Math.max(patientIds.size - newCount, 0),
        pctChange: this.pctChange(patientIds.size, prevPatientIds.size),
        sparkline,
      },
      appointments: {
        total: apptTotal,
        arrived: arrivedNow.length,
        cancelled: current.length - apptTotal,
        pctChange: this.pctChange(apptTotal, prevApptTotal),
      },
      treatmentRevenue: {
        total: revenue,
        pctChange: this.pctChange(revenue, prevRevenue),
      },
      collected: {
        total: collected,
        pctChange: this.pctChange(collected, prevCollected),
      },
    };
  }

  /** Daily revenue by issue date. */
  async revenueByDay(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<Array<{ d: string; total: number; count: bigint }>>`
      SELECT
        to_char(r.at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS d,
        COALESCE(SUM(r.amount), 0)::float AS total,
        SUM(r.cnt) AS count
      FROM ${revenueRowsSql(fromDate, toDate)} r
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map(r => ({
      date: r.d,
      revenue: Number(r.total ?? 0),
      invoiceCount: Number(r.count ?? 0),
    }));
  }

  /** Monthly revenue for the last 6 months (ignores range). */
  async revenueByMonth() {
    const todayIso = clinicDateOnly();
    const today = endOfClinicDay(todayIso);
    const monthStart = new Date(`${todayIso.slice(0, 7)}-01T00:00:00Z`);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
    const start = startOfClinicDay(monthStart.toISOString().slice(0, 10));
    const rows = await this.prisma.$queryRaw<Array<{ m: string; total: number }>>`
      SELECT to_char(r.at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS m,
             COALESCE(SUM(r.amount), 0)::float AS total
      FROM ${revenueRowsSql(start, today)} r
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map(r => ({ month: r.m, revenue: Number(r.total ?? 0) }));
  }

  /**
   * Appointments per day, by final status. `count` leaves out cancellations.
   * A dentist limited to their own calendar sees only their own (A6-18).
   */
  async appointmentsByDay(query: { from?: string; to?: string }, actor: JwtPayload) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        startAt: { gte: fromDate, lte: toDate },
        ...(isRowScoped(actor, 'appointment') ? { dentistId: actor.sub } : {}),
      },
      select: { startAt: true, status: true },
    });
    const days = new Map<
      string,
      { date: string; count: number; arrived: number; noShow: number; cancelled: number }
    >();
    for (const a of rows) {
      const date = clinicDateOnly(a.startAt);
      const d = days.get(date) ?? { date, count: 0, arrived: 0, noShow: 0, cancelled: 0 };
      if (a.status === AppointmentStatus.CANCELLED) d.cancelled += 1;
      else d.count += 1;
      if (ARRIVED_STATUSES.includes(a.status)) d.arrived += 1;
      if (a.status === AppointmentStatus.NO_SHOW) d.noShow += 1;
      days.set(date, d);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * A6-12: appointment outcomes by final status × source × dentist —
   * came / no-show / cancelled (before or after check-in) / left before
   * being seen / walk-in / online. Undoing a no-show and checking in late
   * counts once, as "came", because only the final status is read.
   */
  async appointmentStats(
    query: { from?: string; to?: string; dentistId?: string },
    actor: JwtPayload,
  ) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const scoped = isRowScoped(actor, 'appointment');
    const dentistId = scoped ? actor.sub : query.dentistId;
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      startAt: { gte: fromDate, lte: toDate },
      ...(dentistId ? { dentistId } : {}),
    };
    // Counted in the database (A6-12 review): one row per combination, not
    // one per appointment.
    const [groups, lateCancels] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status', 'source', 'visitKind', 'dentistId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['source', 'dentistId'],
        where: { ...where, status: AppointmentStatus.CANCELLED, checkedInAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    type Tally = {
      total: number;
      pending: number;
      arrived: number;
      inClinic: number;
      completed: number;
      left: number;
      noShow: number;
      cancelled: number;
      cancelledAfterCheckIn: number;
    };
    const empty = (): Tally => ({
      total: 0,
      pending: 0,
      arrived: 0,
      inClinic: 0,
      completed: 0,
      left: 0,
      noShow: 0,
      cancelled: 0,
      cancelledAfterCheckIn: 0,
    });
    const add = (t: Tally, status: AppointmentStatus, n: number) => {
      t.total += n;
      if (PENDING_STATUSES.includes(status)) t.pending += n;
      if (ARRIVED_STATUSES.includes(status)) t.arrived += n;
      if (status === AppointmentStatus.CHECKED_IN || status === AppointmentStatus.IN_PROGRESS) {
        t.inClinic += n;
      }
      if (status === AppointmentStatus.COMPLETED) t.completed += n;
      if (status === AppointmentStatus.LEFT) t.left += n;
      if (status === AppointmentStatus.NO_SHOW) t.noShow += n;
      if (status === AppointmentStatus.CANCELLED) t.cancelled += n;
    };

    const summary = { ...empty(), walkIn: 0, online: 0 };
    const sources = new Map<string, Tally>();
    const dentists = new Map<string, Tally & { dentistId: string; dentistName: string }>();
    const source = (key: string) => {
      const t = sources.get(key) ?? empty();
      sources.set(key, t);
      return t;
    };
    const dentist = (id: string) => {
      const t = dentists.get(id) ?? { ...empty(), dentistId: id, dentistName: 'Chưa rõ' };
      dentists.set(id, t);
      return t;
    };
    for (const g of groups) {
      const n = g._count._all;
      add(summary, g.status, n);
      if (g.visitKind === 'WALK_IN') summary.walkIn += n;
      if (g.source === 'ONLINE') summary.online += n;
      add(source(g.source), g.status, n);
      add(dentist(g.dentistId), g.status, n);
    }
    for (const g of lateCancels) {
      const n = g._count._all;
      summary.cancelledAfterCheckIn += n;
      source(g.source).cancelledAfterCheckIn += n;
      dentist(g.dentistId).cancelledAfterCheckIn += n;
    }
    if (dentists.size) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...dentists.keys()] } },
        select: { id: true, fullName: true },
      });
      for (const u of users) dentist(u.id).dentistName = u.fullName;
    }

    // Online funnel: requests sent → booked → came, by the request's close
    // reason (booking migration 044). Junk requests are left out; a patient
    // who came to the desk counts as arrived even without a linked visit;
    // the patient's own cancellations are kept apart from the clinic's.
    let onlineFunnel: OnlineFunnel | null = null;
    if (!scoped && !dentistId) {
      const sent: Prisma.BookingRequestWhereInput = {
        createdAt: { gte: fromDate, lte: toDate },
        OR: [{ closeReason: null }, { closeReason: { not: 'SPAM' } }],
      };
      const [byReason, booked, arrived] = await Promise.all([
        this.prisma.bookingRequest.groupBy({
          by: ['closeReason'],
          where: { createdAt: { gte: fromDate, lte: toDate } },
          _count: { _all: true },
        }),
        this.prisma.bookingRequest.count({
          where: { ...sent, appointment: { is: { deletedAt: null } } },
        }),
        this.prisma.bookingRequest.count({
          where: {
            AND: [
              sent,
              {
                OR: [
                  { closeReason: { in: ARRIVED_CLOSE_REASONS } },
                  { appointment: { is: { deletedAt: null, status: { in: ARRIVED_STATUSES } } } },
                ],
              },
            ],
          },
        }),
      ]);
      const n = (...reasons: string[]) =>
        byReason
          .filter(r => r.closeReason && reasons.includes(r.closeReason))
          .reduce((a, r) => a + r._count._all, 0);
      const all = byReason.reduce((a, r) => a + r._count._all, 0);
      const spam = n('SPAM');
      onlineFunnel = {
        requests: all - spam,
        booked,
        arrived,
        patientCancelled: n('PATIENT_CANCELLED_VISIT', 'WITHDRAWN_ONLINE', 'CANCELLED_BY_PHONE'),
        declined: n('DECLINED'),
        expired: n('EXPIRED'),
        spam,
      };
    }

    // Due = appointments whose outcome is known (excludes still-pending ones).
    const due = summary.arrived + summary.noShow;
    return {
      from: clinicDateOnly(fromDate),
      to: clinicDateOnly(toDate),
      dentistId: dentistId ?? null,
      scope: scoped ? ('own' as const) : ('all' as const),
      summary,
      rates: {
        arrivalPct: pct(summary.arrived, due),
        noShowPct: pct(summary.noShow, due),
        cancelPct: pct(summary.cancelled, summary.total),
        leftPct: pct(summary.left, summary.arrived),
      },
      bySource: [...sources.entries()]
        .map(([source, t]) => ({ source, sourceLabel: SOURCE_LABELS[source] ?? source, ...t }))
        .sort((a, b) => b.total - a.total),
      byDentist: [...dentists.values()].sort((a, b) => b.total - a.total),
      onlineFunnel,
    };
  }

  /** Revenue by appointment source (Invoice → Encounter → Appointment.source). */
  async revenueBySource(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<
      Array<{ source: string; total: number; count: bigint }>
    >`
      SELECT a."source" AS source,
             COALESCE(SUM(r.amount), 0)::float AS total,
             SUM(r.cnt) AS count
      FROM ${revenueRowsSql(fromDate, toDate)} r
      JOIN "invoices" i ON i.id = r.invoice_id
      JOIN "encounters" e ON e.id = i."encounter_id"
      JOIN "appointments" a ON a.id = e."appointment_id"
      GROUP BY 1
      ORDER BY total DESC
    `;
    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
    return rows.map(r => ({
      source: r.source,
      sourceLabel: SOURCE_LABELS[r.source] ?? r.source,
      revenue: Number(r.total),
      percentage: pct(Number(r.total), grandTotal),
      count: Number(r.count),
    }));
  }

  /**
   * Top procedures by revenue AFTER the invoice discount (pro rata per line),
   * net of refunds dated in range: each issue/refund movement of an invoice
   * is spread over its lines by their share of the subtotal.
   */
  async revenueByProcedure(query: { from?: string; to?: string; limit?: number }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const limit = query.limit ?? 10;
    const rows = await this.prisma.$queryRaw<
      Array<{ procedure: string; total: number; count: bigint }>
    >`
      SELECT t."procedure" AS procedure,
             COALESCE(SUM(
               r.amount * ii."line_total" / NULLIF(i."subtotal", 0)
             ), 0)::float AS total,
             SUM(r.cnt) AS count
      FROM ${revenueRowsSql(fromDate, toDate)} r
      JOIN "invoices" i ON i.id = r.invoice_id
      JOIN "invoice_items" ii ON ii."invoice_id" = i.id AND ii."deleted_at" IS NULL
      JOIN "treatments" t ON t.id = ii."treatment_id"
      GROUP BY 1
      ORDER BY total DESC
      LIMIT ${limit}
    `;
    return rows.map(r => ({
      procedure: r.procedure,
      revenue: Math.round(Number(r.total)),
      count: Number(r.count),
    }));
  }

  /** Revenue by the encounter's dentist. */
  async revenueByDentist(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<
      Array<{ dentist_id: string; dentist_name: string; total: number; count: bigint }>
    >`
      SELECT e."dentist_id",
             u."full_name" AS dentist_name,
             COALESCE(SUM(r.amount), 0)::float AS total,
             SUM(r.cnt) AS count
      FROM ${revenueRowsSql(fromDate, toDate)} r
      JOIN "invoices" i ON i.id = r.invoice_id
      JOIN "encounters" e ON e.id = i."encounter_id"
      JOIN "users" u ON u.id = e."dentist_id"
      GROUP BY 1, 2
      ORDER BY total DESC
    `;
    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
    return rows.map(r => ({
      dentistId: r.dentist_id,
      dentistName: r.dentist_name ?? 'Chưa rõ',
      revenue: Number(r.total),
      percentage: pct(Number(r.total), grandTotal),
      count: Number(r.count),
    }));
  }

  /**
   * A6-13: real revenue split by customer type. A patient is NEW when the
   * first visit they ever came to falls in the range; everyone else is
   * RETURNING. (Replaces the FE estimate that pro-rated by head count.)
   */
  async revenueByCustomerType(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<Array<{ type: string; total: number; count: bigint }>>`
      WITH first_visit AS (
        SELECT a."patient_id", MIN(a."start_at") AS first_at
        FROM "appointments" a
        WHERE a."deleted_at" IS NULL
          AND a."status"::text IN (${Prisma.join(ARRIVED_STATUSES)})
        GROUP BY 1
      )
      SELECT CASE WHEN fv.first_at < ${fromDate} THEN 'RETURNING' ELSE 'NEW' END AS type,
             COALESCE(SUM(r.amount), 0)::float AS total,
             SUM(r.cnt) AS count
      FROM ${revenueRowsSql(fromDate, toDate)} r
      JOIN "invoices" i ON i.id = r.invoice_id
      LEFT JOIN first_visit fv ON fv."patient_id" = i."patient_id"
      GROUP BY 1
    `;
    const total = rows.reduce((acc, r) => acc + Number(r.total), 0);
    return (['NEW', 'RETURNING'] as const).map(type => {
      const row = rows.find(r => r.type === type);
      const revenue = Number(row?.total ?? 0);
      return { type, revenue, percentage: pct(revenue, total), count: Number(row?.count ?? 0) };
    });
  }

  /** BR-EXP-001: collected (net of refunds) vs APPROVED expenses. */
  async financeSummary(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const [totalIncome, totalExpense] = await Promise.all([
      this.collectedTotal(fromDate, toDate),
      this.expense.aggregateApproved(fromDate, toDate),
    ]);
    return { totalIncome, totalExpense };
  }

  /** Every open balance (same set as the aging report with no threshold). */
  async outstandingSummary() {
    const agg = await this.prisma.invoice.aggregate({
      _sum: { outstandingAmount: true },
      _count: { _all: true },
      where: {
        deletedAt: null,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        outstandingAmount: { gt: 0 },
      },
    });
    return {
      totalDebt: Number(agg._sum.outstandingAmount ?? 0),
      invoiceCount: Number(agg._count._all ?? 0),
    };
  }
}
