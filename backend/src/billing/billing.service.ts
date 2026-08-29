import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { ExpenseService } from '../expense/expense.service';
import {
  InvoiceDiscountInvalidException,
  InvoiceNotEditableException,
  InvoiceNotFoundException,
  InvoiceVersionMismatchException,
  InvoiceVoidFailedException,
  PaymentExceedsOutstandingException,
} from './domain/exceptions';
import {
  IssueInvoiceDto,
  RecordPaymentDto,
  UpdateDiscountDto,
  UpdateInvoiceNotesDto,
  VoidInvoiceDto,
} from './dto/billing.dto';

/**
 * BillingService — invoice lifecycle:
 *   - createDraft (auto on ENCOUNTER_CLOSED_EVENT or manual)
 *   - updateDiscount (with optimistic-lock via version field)
 *   - recordPayment → updates paidAmount, status PAID|PARTIAL
 *   - issue (DRAFT → ISSUED)
 *   - void (admin/receptionist only)
 *
 * Cross-module:
 *   - EncounterClosedListener observes ENCOUNTER_CLOSED_EVENT and creates
 *     a DRAFT invoice with each treatment as a line item.
 *   - Listens idempotently (check Invoice.findUnique({ encounterId })).
 *
 * Reports:
 *   - revenueByPeriod (sum paidAmount for invoices PAID within range)
 *   - outstandingAging (sum outstandingAmount where status IS ISSUED|PARTIAL)
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => ExpenseService))
    private readonly expense: ExpenseService,
  ) {}

  // ==========================================================================
  // Public API
  // ==========================================================================

  async generateInvoiceCode(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('invoice_code_seq')
    `;
    const next = rows[0].nextval;
    const padded = String(Number(next)).padStart(6, '0');
    return `INV-${year}-${padded}`;
  }

  /**
   * Auto-create a DRAFT invoice from a closed encounter (called by listener).
   * Idempotent: if encounter already has an invoice, return that invoice.
   */
  async createDraftFromEncounter(
    encounterId: string,
    treatments: Array<{
      treatmentId: string;
      procedure: string;
      description: string | null;
      unitPrice: number;
    }>,
  ) {
    const existing = await this.prisma.invoice.findUnique({ where: { encounterId } });
    if (existing) return existing;

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) return null;

    const code = await this.generateInvoiceCode();
    const subtotal = treatments.reduce((acc, t) => acc + t.unitPrice, 0);

    return this.prisma.$transaction(
      async tx => {
        const invoice = await tx.invoice.create({
          data: {
            code,
            encounterId,
            patientId: encounter.patientId,
            status: InvoiceStatus.DRAFT,
            subtotal: new Prisma.Decimal(subtotal),
            total: new Prisma.Decimal(subtotal),
            paidAmount: new Prisma.Decimal(0),
            outstandingAmount: new Prisma.Decimal(subtotal),
            createdBy: null,
          },
        });
        let seq = 0;
        for (const t of treatments) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              treatmentId: t.treatmentId,
              sequence: seq++,
              description: `${t.procedure}${t.description ? ' — ' + t.description : ''}`,
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(t.unitPrice),
              lineTotal: new Prisma.Decimal(t.unitPrice),
            },
          });
        }
        await tx.invoiceAudit.create({
          data: {
            invoiceId: invoice.id,
            action: 'DRAFTED_FROM_ENCOUNTER',
            actorId: encounter.dentistId,
            after: { subtotal, code },
          },
        });
        return invoice;
      },
      // Serializable isolation: prevents two concurrent encounter-closed
      // events from creating two DRAFT invoices for the same encounter.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listInvoices(query: {
    patientId?: string;
    dentistId?: string;
    from?: string;
    to?: string;
    status?: InvoiceStatus[];
    actor: JwtPayload;
  }) {
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.status && { status: { in: query.status } }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    if (query.dentistId) {
      where.encounter = { dentistId: query.dentistId };
    } else if (
      !query.actor.permissions.includes('invoice.read.any') &&
      query.actor.permissions.includes('invoice.read.own')
    ) {
      // BR-BILL-003 dentist row-level
      where.encounter = { dentistId: query.actor.sub };
    }

    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        patient: { select: { id: true, code: true, fullName: true } },
        encounter: {
          select: {
            id: true,
            dentistId: true,
            dentist: { select: { fullName: true } },
            closedAt: true,
          },
        },
        items: { orderBy: { sequence: 'asc' } },
      },
    });
  }

  async getInvoiceById(id: string, actor?: JwtPayload) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sequence: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' }, include: { receivedByUser: { select: { fullName: true, email: true } } } },
        audits: { orderBy: { occurredAt: 'desc' }, take: 50 },
        patient: true,
        encounter: { include: { dentist: { select: { fullName: true } } } },
      },
    });
    if (!inv) throw new InvoiceNotFoundException(id);
    if (inv.deletedAt) throw new InvoiceNotFoundException(id);

    // BR-BILL-003 dentist row-level
    if (
      actor &&
      !actor.permissions.includes('invoice.read.any') &&
      actor.permissions.includes('invoice.read.own') &&
      inv.encounter.dentistId !== actor.sub
    ) {
      throw new InvoiceNotFoundException(id);
    }

    return inv;
  }

  async getInvoiceByEncounterId(encounterId: string) {
    return this.prisma.invoice.findUnique({
      where: { encounterId },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
  }

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: JwtPayload) {
    return this.prisma.$transaction(
      async tx => {
        const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv) throw new InvoiceNotFoundException(invoiceId);
        if (inv.status === InvoiceStatus.VOIDED) {
          throw new InvoiceNotEditableException(inv.status);
        }
        if (inv.status === InvoiceStatus.DRAFT) {
          throw new InvoiceNotEditableException(
            `${inv.status} — issue invoice before recording payment`,
          );
        }
        const requested = Number(dto.amount);
        const outstanding = Number(inv.outstandingAmount);
        if (requested > outstanding) {
          throw new PaymentExceedsOutstandingException(requested, outstanding);
        }

        const newPaid = Number(inv.paidAmount) + requested;
        const newOutstanding = outstanding - requested;
        // Epsilon for currency comparison (DECIMAL 12,2 rounded to cents).
        const EPSILON = 0.005;
        const newStatus =
          newOutstanding <= EPSILON
            ? InvoiceStatus.PAID
            : newPaid > EPSILON
              ? InvoiceStatus.PARTIAL
              : InvoiceStatus.ISSUED;

        // Atomic guarded update: only succeed if outstanding hasn't been
        // deducted by a concurrent payment (prevents negative outstanding).
        const guarded = await tx.invoice.updateMany({
          where: {
            id: invoiceId,
            outstandingAmount: { gte: requested },
            version: inv.version,
          },
          data: {
            paidAmount: new Prisma.Decimal(newPaid),
            outstandingAmount: new Prisma.Decimal(newOutstanding),
            status: newStatus,
            version: { increment: 1 },
          },
        });
        if (guarded.count === 0) {
          // Re-read to give the caller a fresh outstanding
          const fresh = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: { outstandingAmount: true },
          });
          throw new PaymentExceedsOutstandingException(
            requested,
            Number(fresh?.outstandingAmount ?? 0),
          );
        }

        const payment = await tx.payment.create({
          data: {
            invoiceId,
            amount: dto.amount,
            method: dto.method,
            status: 'COMPLETED',
            note: dto.note ?? null,
            receivedBy: actor.sub,
          },
        });

        const updated = await tx.invoice.findUnique({ where: { id: invoiceId } });

        await tx.invoiceAudit.create({
          data: {
            invoiceId,
            action: 'PAYMENT_RECORDED',
            actorId: actor.sub,
            before: {
              paidAmount: inv.paidAmount,
              outstanding: inv.outstandingAmount,
            },
            after: {
              paidAmount: updated?.paidAmount,
              outstanding: updated?.outstandingAmount,
            },
          },
        });

        await this.audit.log({
          action: 'INVOICE_PAYMENT_RECORDED',
          actorUserId: actor.sub,
          targetType: 'invoice',
          targetId: invoiceId,
          metadata: {
            amount: requested,
            method: dto.method,
            newStatus,
            paymentId: payment.id,
          },
        });

        return updated;
      },
      // Serializable: guards against two concurrent payments both reading the
      // same outstandingAmount and over-deducting. Combined with the
      // `updateMany` version-guarded write, the application cannot reach a
      // negative outstandingAmount even under contention.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateDiscount(invoiceId: string, dto: UpdateDiscountDto, actor: JwtPayload) {
    return this.prisma.$transaction(
      async tx => {
        const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv) throw new InvoiceNotFoundException(invoiceId);
        if (inv.status !== InvoiceStatus.DRAFT) {
          throw new InvoiceNotEditableException(inv.status);
        }
        if (inv.version !== dto.version) {
          throw new InvoiceVersionMismatchException(dto.version, inv.version);
        }
        // Validate discount
        if (dto.discountType === 'PERCENT' && dto.discountValue > 100) {
          throw new InvoiceDiscountInvalidException('Percent must be between 0 and 100');
        }
        if (dto.discountType === 'AMOUNT' && dto.discountValue > Number(inv.subtotal)) {
          throw new InvoiceDiscountInvalidException('Amount discount cannot exceed subtotal');
        }

        const discountAmount =
          dto.discountType === 'PERCENT'
            ? (Number(inv.subtotal) * dto.discountValue) / 100
            : dto.discountValue;
        const newTotal = Number(inv.subtotal) - discountAmount;
        const newOutstanding = newTotal - Number(inv.paidAmount);

        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            discountType: dto.discountType,
            discountValue: new Prisma.Decimal(dto.discountValue),
            total: new Prisma.Decimal(newTotal),
            outstandingAmount: new Prisma.Decimal(newOutstanding),
            version: { increment: 1 },
          },
        });
        await tx.invoiceAudit.create({
          data: {
            invoiceId,
            action: 'DISCOUNT_UPDATED',
            actorId: actor.sub,
            before: {
              total: inv.total,
              discountType: inv.discountType,
              discountValue: inv.discountValue,
            },
            after: {
              total: updated.total,
              discountType: dto.discountType,
              discountValue: dto.discountValue,
            },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateNotes(invoiceId: string, dto: UpdateInvoiceNotesDto) {
    return this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new InvoiceNotEditableException(inv.status);
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      return tx.invoice.update({
        where: { id: invoiceId },
        data: { notes: dto.notes ?? null, version: { increment: 1 } },
      });
    });
  }

  async issue(invoiceId: string, dto: IssueInvoiceDto, actor: JwtPayload) {
    return this.prisma.$transaction(
      async tx => {
        const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv) throw new InvoiceNotFoundException(invoiceId);
        if (inv.status !== InvoiceStatus.DRAFT) {
          throw new InvoiceNotEditableException(inv.status);
        }
        if (inv.version !== dto.version) {
          throw new InvoiceVersionMismatchException(dto.version, inv.version);
        }
        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: InvoiceStatus.ISSUED,
            issuedAt: new Date(),
            issuedBy: actor.sub,
            version: { increment: 1 },
          },
        });
        await tx.invoiceAudit.create({
          data: {
            invoiceId,
            action: 'ISSUED',
            actorId: actor.sub,
            before: { status: 'DRAFT' },
            after: { status: 'ISSUED' },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async voidInvoice(invoiceId: string, dto: VoidInvoiceDto, actor: JwtPayload) {
    return this.prisma.$transaction(
      async tx => {
        const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv) throw new InvoiceNotFoundException(invoiceId);
        if (inv.status === InvoiceStatus.VOIDED) {
          throw new InvoiceVoidFailedException('Invoice already voided');
        }
        if (Number(inv.paidAmount) > 0) {
          throw new InvoiceVoidFailedException(
            'Cannot void invoice with payments; refund payments first',
          );
        }
        if (inv.version !== dto.version) {
          throw new InvoiceVersionMismatchException(dto.version, inv.version);
        }
        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: InvoiceStatus.VOIDED,
            voidedAt: new Date(),
            voidedBy: actor.sub,
            voidReason: dto.reason,
            version: { increment: 1 },
          },
        });
        await tx.invoiceAudit.create({
          data: {
            invoiceId,
            action: 'VOIDED',
            actorId: actor.sub,
            before: { status: inv.status },
            after: { status: 'VOIDED' },
          },
        });
        await this.audit.log({
          action: 'INVOICE_VOIDED',
          actorUserId: actor.sub,
          targetType: 'invoice',
          targetId: invoiceId,
          metadata: { reason: dto.reason },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * BR-BILL-008: Revenue report for a period. Returns:
   *   - totalInvoiced
   *   - totalCollected
   *   - totalOutstanding
   *   - perDentist breakdown
   */
  async revenueReport(query: { from: string; to: string; dentistId?: string }) {
    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);
    const baseWhere: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      createdAt: { gte: fromDate, lte: toDate },
    };
    if (query.dentistId) {
      baseWhere.encounter = { dentistId: query.dentistId };
    }

    const [invoices, perDentist, perMonth, paymentMethods] = await Promise.all([
      this.prisma.invoice.findMany({
        where: baseWhere,
        select: {
          id: true,
          status: true,
          total: true,
          paidAmount: true,
          outstandingAmount: true,
          encounter: { select: { dentistId: true, dentist: { select: { fullName: true } } } },
        },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
        _sum: { total: true, paidAmount: true, outstandingAmount: true },
      }),
      // Monthly aggregates by createdAt
      this.prisma.$queryRaw<Array<{ month: string; total: number; paid: number; count: bigint }>>`
        SELECT
          to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month,
          COALESCE(SUM("total"), 0)::float AS total,
          COALESCE(SUM("paid_amount"), 0)::float AS paid,
          COUNT(*) AS count
        FROM "invoices"
        WHERE "deleted_at" IS NULL
          AND "created_at" >= ${fromDate}
          AND "created_at" <= ${toDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      // Payment method aggregates (for non-voided payments in range)
      this.prisma.$queryRaw<Array<{ method: string; amount: number; count: bigint }>>`
        SELECT
          p.method AS method,
          COALESCE(SUM(p.amount), 0)::float AS amount,
          COUNT(*) AS count
        FROM "payments" p
        JOIN "invoices" i ON i.id = p.invoice_id
        WHERE p.status = 'COMPLETED'
          AND i."deleted_at" IS NULL
          AND i."created_at" >= ${fromDate}
          AND i."created_at" <= ${toDate}
        GROUP BY 1
        ORDER BY amount DESC
      `,
    ]);

    // Derive breakdowns from the loaded invoice set
    const byMonth = perMonth.map(m => ({
      month: m.month,
      total: Number(m.total ?? 0),
      paid: Number(m.paid ?? 0),
      count: Number(m.count ?? 0),
    }));

    // Aggregate by dentist (across the loaded invoice set)
    const dentistMap = new Map<
      string,
      { dentistId: string; dentistName: string; total: number; paid: number; count: number }
    >();
    for (const inv of invoices) {
      const id = inv.encounter?.dentistId ?? 'unknown';
      const name = inv.encounter?.dentist?.fullName ?? 'Chưa rõ';
      const cur = dentistMap.get(id) ?? {
        dentistId: id,
        dentistName: name,
        total: 0,
        paid: 0,
        count: 0,
      };
      cur.total += Number(inv.total ?? 0);
      cur.paid += Number(inv.paidAmount ?? 0);
      cur.count += 1;
      dentistMap.set(id, cur);
    }
    const grandTotal = invoices.reduce((acc, i) => acc + Number(i.total ?? 0), 0);
    const byDentist = Array.from(dentistMap.values())
      .map(d => ({
        dentistId: d.dentistId,
        dentistName: d.dentistName,
        total: d.total,
        count: d.count,
        sharePct: grandTotal > 0 ? (d.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Aggregate by service (description) — load items separately for clarity
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        deletedAt: null,
        invoice: {
          deletedAt: null,
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: { description: true, lineTotal: true },
    });
    const serviceMap = new Map<string, { service: string; total: number; count: number }>();
    for (const it of items) {
      const key = it.description || 'Khác';
      const cur = serviceMap.get(key) ?? { service: key, total: 0, count: 0 };
      cur.total += Number(it.lineTotal ?? 0);
      cur.count += 1;
      serviceMap.set(key, cur);
    }
    const byService = Array.from(serviceMap.values()).sort((a, b) => b.total - a.total);

    // Payment methods
    const totalPaidAll = paymentMethods.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const byPaymentMethod = paymentMethods.map(p => ({
      method: String(p.method),
      amount: Number(p.amount ?? 0),
      count: Number(p.count ?? 0),
      sharePct: totalPaidAll > 0 ? (Number(p.amount) / totalPaidAll) * 100 : 0,
    }));

    return {
      from: query.from,
      to: query.to,
      totalInvoiced: grandTotal,
      totalCollected: invoices.reduce((acc, i) => acc + Number(i.paidAmount ?? 0), 0),
      totalOutstanding: invoices.reduce((acc, i) => acc + Number(i.outstandingAmount ?? 0), 0),
      invoiceCount: invoices.length,
      byStatus: perDentist.map(row => ({
        status: row.status,
        count: row._count._all,
        total: Number(row._sum.total ?? 0),
        paid: Number(row._sum.paidAmount ?? 0),
        outstanding: Number(row._sum.outstandingAmount ?? 0),
      })),
      byMonth,
      byDentist,
      byService,
      byPaymentMethod,
    };
  }

  /**
   * BR-BILL-009: Outstanding aging report.
   * Buckets: 0–7, 8–30, 31–60, 61–90, >90 days since ISSUED.
   */
  async outstandingAging(query: { daysOutstanding: number }) {
    const cutoff = new Date(Date.now() - query.daysOutstanding * 86_400_000);
    const rows = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        outstandingAmount: { gt: 0 },
        issuedAt: { not: null, lte: cutoff },
      },
      select: {
        id: true,
        code: true,
        patientId: true,
        patient: { select: { fullName: true, code: true } },
        outstandingAmount: true,
        issuedAt: true,
      },
    });
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      patient: r.patient,
      outstanding: Number(r.outstandingAmount),
      issuedAt: r.issuedAt,
      daysOld: r.issuedAt
        ? Math.floor((Date.now() - new Date(r.issuedAt).getTime()) / 86_400_000)
        : null,
    }));
  }

  /**
   * BR-BILL-005: Audit history for an invoice.
   */
  async getInvoiceAudits(invoiceId: string, actor: JwtPayload) {
    if (!actor.permissions.includes('invoice.audit.read')) {
      throw new InvoiceNotFoundException(invoiceId);
    }
    return this.prisma.invoiceAudit.findMany({
      where: { invoiceId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  // ==========================================================================
  // Dashboard analytics (Phase 10 — frontend redesign)
  // All endpoints accept optional { from, to } ISO yyyy-MM-dd.
  // When `to` is omitted, defaults to today. When both omitted → last 7 days.
  // ==========================================================================

  private resolveRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const toDate = to ? new Date(to) : today;
    if (toDate.getHours() === 0 && toDate.getMinutes() === 0) {
      toDate.setHours(23, 59, 59, 999);
    }
    let fromDate: Date;
    if (from) {
      fromDate = new Date(from);
    } else {
      fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 6);
    }
    fromDate.setHours(0, 0, 0, 0);
    return { fromDate, toDate };
  }

  /** Build the previous-period range of equal length immediately before [from, to]. */
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

  /**
   * KPI cards on the dashboard (Bệnh nhân, Lịch hẹn, Doanh số, Tiền đã thu).
   * Returns current totals, delta vs previous equivalent period, and a daily sparkline.
   */
  async dashboardKpis(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const { prevFrom, prevTo } = this.previousRange(fromDate, toDate);

    const [currentPatients, prevPatients, currentAppointments, prevAppointments] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: { startAt: { gte: fromDate, lte: toDate }, deletedAt: null },
          select: { patientId: true, startAt: true },
        }),
        this.prisma.appointment.findMany({
          where: { startAt: { gte: prevFrom, lte: prevTo }, deletedAt: null },
          select: { patientId: true },
        }),
        this.prisma.appointment.count({
          where: { startAt: { gte: fromDate, lte: toDate }, deletedAt: null },
        }),
        this.prisma.appointment.count({
          where: { startAt: { gte: prevFrom, lte: prevTo }, deletedAt: null },
        }),
      ]);

    // Treatment revenue & collected from current period (non-voided invoices).
    const [revAgg, paidAgg, prevRevAgg, prevPaidAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          deletedAt: null,
          status: { not: InvoiceStatus.VOIDED },
          issuedAt: { gte: fromDate, lte: toDate, not: null },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'COMPLETED',
          invoice: { deletedAt: null, status: { not: InvoiceStatus.VOIDED } },
          paidAt: { gte: fromDate, lte: toDate },
        },
      }),
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          deletedAt: null,
          status: { not: InvoiceStatus.VOIDED },
          issuedAt: { gte: prevFrom, lte: prevTo, not: null },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'COMPLETED',
          invoice: { deletedAt: null, status: { not: InvoiceStatus.VOIDED } },
          paidAt: { gte: prevFrom, lte: prevTo },
        },
      }),
    ]);

    // Patient totals — distinct patientIds seen in appointments, split into
    // NEW (first-ever appointment within range) vs RETURNING (had appointment before).
    const patientIds = new Set(currentPatients.map(a => a.patientId));
    const prevPatientIds = new Set(prevPatients.map(a => a.patientId));
    const allPatients = patientIds.size;
    // New = in current range AND not seen in previous range (a simple proxy that
    // is correct for the "today" use case; longer ranges may overcount).
    // For more accuracy we count patients whose first-ever appointment falls in range.
    const firstVisitCounts = await this.prisma.appointment.groupBy({
      by: ['patientId'],
      _min: { startAt: true },
      where: { patientId: { in: Array.from(patientIds) }, deletedAt: null },
    });
    let newCount = 0;
    for (const row of firstVisitCounts) {
      const first = row._min.startAt;
      if (first && first >= fromDate && first <= toDate) newCount++;
    }
    const returningCount = Math.max(allPatients - newCount, 0);

    // Sparkline: count distinct patients per day in current range.
    const sparklineRows = await this.prisma.$queryRaw<Array<{ d: Date; cnt: bigint }>>`
      SELECT date_trunc('day', a."start_at") AS d, COUNT(DISTINCT a."patient_id") AS cnt
      FROM "appointments" a
      WHERE a."deleted_at" IS NULL
        AND a."start_at" >= ${fromDate}
        AND a."start_at" <= ${toDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const sparkline = sparklineRows.map(r => ({
      date: new Date(r.d).toISOString().slice(0, 10),
      value: Number(r.cnt),
    }));

    const treatmentRevenueTotal = Number(revAgg._sum.total ?? 0);
    const collectedTotal = Number(paidAgg._sum.amount ?? 0);
    const prevTreatmentRevenueTotal = Number(prevRevAgg._sum.total ?? 0);
    const prevCollectedTotal = Number(prevPaidAgg._sum.amount ?? 0);

    return {
      patients: {
        total: allPatients,
        newCount,
        returningCount,
        pctChange: this.pctChange(allPatients, prevPatientIds.size),
        sparkline,
      },
      appointments: {
        total: currentAppointments,
        pctChange: this.pctChange(currentAppointments, prevAppointments),
      },
      treatmentRevenue: {
        total: treatmentRevenueTotal,
        pctChange: this.pctChange(treatmentRevenueTotal, prevTreatmentRevenueTotal),
      },
      collected: {
        total: collectedTotal,
        pctChange: this.pctChange(collectedTotal, prevCollectedTotal),
      },
    };
  }

  /** Daily revenue (issue-date) — used for 15-day bar chart. */
  async revenueByDay(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<Array<{ d: Date; total: number; count: bigint }>>`
      SELECT
        date_trunc('day', i."issued_at") AS d,
        COALESCE(SUM(i."total"), 0)::float AS total,
        COUNT(*) AS count
      FROM "invoices" i
      WHERE i."deleted_at" IS NULL
        AND i."status" <> 'VOIDED'
        AND i."issued_at" IS NOT NULL
        AND i."issued_at" >= ${fromDate}
        AND i."issued_at" <= ${toDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map(r => ({
      date: new Date(r.d).toISOString().slice(0, 10),
      revenue: Number(r.total ?? 0),
      invoiceCount: Number(r.count ?? 0),
    }));
  }

  /** Monthly revenue for the last 6 months (ignores range). */
  async revenueByMonth() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setMonth(start.getMonth() - 5);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ m: string; total: number }>>`
      SELECT to_char(date_trunc('month', i."issued_at"), 'YYYY-MM') AS m,
             COALESCE(SUM(i."total"), 0)::float AS total
      FROM "invoices" i
      WHERE i."deleted_at" IS NULL
        AND i."status" <> 'VOIDED'
        AND i."issued_at" IS NOT NULL
        AND i."issued_at" >= ${start}
        AND i."issued_at" <= ${today}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map(r => ({ month: r.m, revenue: Number(r.total ?? 0) }));
  }

  /** Appointments count per day for the last 7 days (default). */
  async appointmentsByDay(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from ?? this.daysAgoIso(6), query.to);
    const rows = await this.prisma.$queryRaw<Array<{ d: Date; cnt: bigint }>>`
      SELECT date_trunc('day', a."start_at") AS d, COUNT(*) AS cnt
      FROM "appointments" a
      WHERE a."deleted_at" IS NULL
        AND a."start_at" >= ${fromDate}
        AND a."start_at" <= ${toDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map(r => ({
      date: new Date(r.d).toISOString().slice(0, 10),
      count: Number(r.cnt),
    }));
  }

  /** Revenue broken down by Appointment source (WALK_IN / PHONE / ONLINE / RETURNING).
   *  Invoice.encounterId → Encounter.appointmentId → Appointment.source
   */
  async revenueBySource(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<
      Array<{ source: string; total: number; count: bigint }>
    >`
      SELECT a."source" AS source,
             COALESCE(SUM(i."total"), 0)::float AS total,
             COUNT(*) AS count
      FROM "invoices" i
      JOIN "encounters" e ON e.id = i."encounter_id"
      JOIN "appointments" a ON a.id = e."appointment_id"
      WHERE i."deleted_at" IS NULL
        AND i."status" <> 'VOIDED'
        AND i."issued_at" >= ${fromDate}
        AND i."issued_at" <= ${toDate}
      GROUP BY 1
      ORDER BY total DESC
    `;
    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
    const labels: Record<string, string> = {
      WALK_IN: 'Khách vãng lai',
      PHONE: 'Qua điện thoại',
      ONLINE: 'Trực tuyến',
      RETURNING: 'Khách quay lại',
    };
    return rows.map(r => ({
      source: r.source,
      sourceLabel: labels[r.source] ?? r.source,
      revenue: Number(r.total),
      percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 1000) / 10 : 0,
      count: Number(r.count),
    }));
  }

  /** Top 10 procedures by revenue. */
  async revenueByProcedure(query: { from?: string; to?: string; limit?: number }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const limit = query.limit ?? 10;
    const rows = await this.prisma.$queryRaw<
      Array<{ procedure: string; total: number; count: bigint }>
    >`
      SELECT t."procedure" AS procedure,
             COALESCE(SUM(ii."line_total"), 0)::float AS total,
             COUNT(*) AS count
      FROM "invoice_items" ii
      JOIN "invoices" i ON i.id = ii."invoice_id"
      JOIN "treatments" t ON t.id = ii."treatment_id"
      WHERE ii."deleted_at" IS NULL
        AND i."deleted_at" IS NULL
        AND i."status" <> 'VOIDED'
        AND i."issued_at" >= ${fromDate}
        AND i."issued_at" <= ${toDate}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT ${limit}
    `;
    return rows.map(r => ({
      procedure: r.procedure,
      revenue: Number(r.total),
      count: Number(r.count),
    }));
  }

  /** Revenue by dentist (Invoice.encounterId → Encounter.dentistId → User.fullName). */
  async revenueByDentist(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const rows = await this.prisma.$queryRaw<
      Array<{ dentist_id: string; dentist_name: string; total: number; count: bigint }>
    >`
      SELECT e."dentist_id",
             u."full_name" AS dentist_name,
             COALESCE(SUM(i."total"), 0)::float AS total,
             COUNT(*) AS count
      FROM "invoices" i
      JOIN "encounters" e ON e.id = i."encounter_id"
      JOIN "users" u ON u.id = e."dentist_id"
      WHERE i."deleted_at" IS NULL
        AND i."status" <> 'VOIDED'
        AND i."issued_at" >= ${fromDate}
        AND i."issued_at" <= ${toDate}
      GROUP BY 1, 2
      ORDER BY total DESC
    `;
    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
    return rows.map(r => ({
      dentistId: r.dentist_id,
      dentistName: r.dentist_name ?? 'Chưa rõ',
      revenue: Number(r.total),
      percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 1000) / 10 : 0,
      count: Number(r.count),
    }));
  }

  /**
   * BR-EXP-001: Total income (payments) and total expense (from ExpenseService).
   * Only APPROVED expenses are counted as they represent realized costs.
   */
  async financeSummary(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.resolveRange(query.from, query.to);
    const incomeAgg = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: 'COMPLETED',
        invoice: { deletedAt: null, status: { not: InvoiceStatus.VOIDED } },
        paidAt: { gte: fromDate, lte: toDate },
      },
    });
    // Wire to expense module (BR-EXP-001)
    const totalExpense = await this.expense.aggregateApproved(fromDate, toDate);
    return {
      totalIncome: Number(incomeAgg._sum.amount ?? 0),
      totalExpense,
    };
  }

  /** Aggregated outstanding debt (everything non-voided with positive outstanding). */
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

  private daysAgoIso(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
