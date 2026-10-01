import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { startOfClinicDay, endOfClinicDay } from '../common/date-range.util';
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
 * Reports and Dashboard aggregates live in ReportsService (src/reports),
 * which defines revenue once (revenue-basis.ts).
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
    const rows = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('invoice_code_seq'))::text AS lock_result
      `;
      await tx.$queryRaw`
        WITH current_codes AS (
          SELECT COALESCE(MAX(split_part(code, '-', 3)::bigint), 0) AS max_value
          FROM invoices
          WHERE code ~ '^INV-[0-9]{4}-[0-9]+$'
        )
        SELECT setval(
          'invoice_code_seq',
          GREATEST((SELECT last_value FROM invoice_code_seq), current_codes.max_value, 1),
          (SELECT is_called FROM invoice_code_seq) OR current_codes.max_value > 0
        )
        FROM current_codes
      `;
      return tx.$queryRaw<Array<{ nextval: bigint }>>`
        SELECT nextval('invoice_code_seq')
      `;
    });
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
      /** Defaults to 1 for events queued before treatments had a quantity. */
      quantity?: number;
    }>,
  ) {
    const existing = await this.prisma.invoice.findUnique({ where: { encounterId } });
    if (existing) return existing;

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) return null;

    const code = await this.generateInvoiceCode();
    const lineTotal = (t: { unitPrice: number; quantity?: number }) =>
      t.unitPrice * (t.quantity ?? 1);
    const subtotal = treatments.reduce((acc, t) => acc + lineTotal(t), 0);

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
              quantity: new Prisma.Decimal(t.quantity ?? 1),
              unitPrice: new Prisma.Decimal(t.unitPrice),
              lineTotal: new Prisma.Decimal(lineTotal(t)),
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
    q?: string;
    patientId?: string;
    dentistId?: string;
    from?: string;
    to?: string;
    status?: InvoiceStatus[];
    pageSize?: number;
    cursor?: string;
    actor: JwtPayload;
  }) {
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.status && { status: { in: query.status } }),
      // Bare dates cover the full Vietnam day; explicit timestamps stay intact.
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: startOfClinicDay(query.from) }),
          ...(query.to && { lte: endOfClinicDay(query.to) }),
        },
      }),
      ...(query.q && {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { patient: { fullName: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };

    if (query.actor.permissions.includes('invoice.read.any')) {
      // Only a caller who can see any invoice may filter by an arbitrary
      // dentistId. A dentist-scoped caller used to be able to pass their
      // OWN dentistId query param and have it override the BR-BILL-003
      // row-level restriction below, exposing other dentists' patients'
      // invoices/financials to anyone who guessed a dentist id.
      if (query.dentistId) {
        where.encounter = { dentistId: query.dentistId };
      }
    } else {
      // BR-BILL-003 dentist row-level — the route requires at least
      // invoice.read.any or invoice.read.own, so reaching here means the
      // caller only has invoice.read.own. Ignore any client-supplied
      // dentistId and force scope to the caller's own encounters.
      where.encounter = { dentistId: query.actor.sub };
    }

    const pageSize = query.pageSize ?? 20;
    const [invoiceRows, aggregate] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
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
      }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { total: true, paidAmount: true, outstandingAmount: true },
        _count: { _all: true },
      }),
    ]);

    const hasMore = invoiceRows.length > pageSize;
    const page = hasMore ? invoiceRows.slice(0, pageSize) : invoiceRows;
    return {
      data: page.map(inv => this.formatInvoice(inv)),
      pagination: {
        pageSize,
        hasMore,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      },
      summary: {
        invoiceCount: aggregate._count._all,
        totalInvoiced: Number(aggregate._sum.total ?? 0),
        totalCollected: Number(aggregate._sum.paidAmount ?? 0),
        totalOutstanding: Number(aggregate._sum.outstandingAmount ?? 0),
      },
    };
  }

  // Flattens the `patient` relation into patientCode/patientName — the
  // frontend Invoice type expects these as top-level fields, not nested —
  // and converts Decimal columns to real numbers. Prisma Decimals
  // JSON-serialize as strings, but the frontend Invoice type declares
  // `total`/`paidAmount`/etc as `number`; any caller that sums them
  // (rather than just formatting one for display) got string concatenation
  // instead of addition. Only meaningful when `patient` was actually
  // included in the query (listInvoices/getInvoiceById); other mutation
  // return values don't carry it and their callers re-fetch via
  // getInvoiceById anyway.
  private formatInvoice<
    T extends {
      patient?: { code: string; fullName: string } | null;
      subtotal: unknown;
      discountValue?: unknown;
      total: unknown;
      paidAmount: unknown;
      outstandingAmount: unknown;
      items?: Array<{ quantity: unknown; unitPrice: unknown; lineTotal: unknown }>;
      payments?: Array<{ amount: unknown }>;
    },
  >(invoice: T) {
    const { patient, ...rest } = invoice;
    return {
      ...rest,
      patientCode: patient?.code,
      patientName: patient?.fullName,
      subtotal: Number(invoice.subtotal),
      discountValue:
        invoice.discountValue === null || invoice.discountValue === undefined
          ? invoice.discountValue
          : Number(invoice.discountValue),
      total: Number(invoice.total),
      paidAmount: Number(invoice.paidAmount),
      outstandingAmount: Number(invoice.outstandingAmount),
      items: invoice.items?.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      payments: invoice.payments?.map(p => ({ ...p, amount: Number(p.amount) })),
    };
  }

  async getInvoiceById(id: string, actor?: JwtPayload) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sequence: 'asc' } },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: { receivedByUser: { select: { fullName: true, email: true } } },
        },
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

    return this.formatInvoice(inv);
  }

  async getInvoiceByEncounterId(encounterId: string, actor: JwtPayload) {
    return this.prisma.invoice.findFirst({
      where: {
        encounterId,
        deletedAt: null,
        ...(!actor.permissions.includes('invoice.read.any') && {
          encounter: { dentistId: actor.sub },
        }),
      },
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

        await this.audit.log(
          {
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
          },
          tx,
        );

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
        return tx.invoice.update({
          where: { id: invoiceId },
          data: { notes: dto.notes ?? null, version: { increment: 1 } },
        });
      },
      // The version check above is a read-then-compare in application code,
      // not a WHERE clause, so under the default READ COMMITTED two people
      // editing the same draft invoice both read version N, both pass, and
      // both write — one edit is lost and version jumps by 2, which then
      // rejects the next legitimate edit with a confusing mismatch. Every
      // other mutating method on this invoice (issue, voidInvoice,
      // updateDiscount, recordPayment) already runs Serializable for exactly
      // this reason; this one was the gap.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
        await this.audit.log(
          {
            action: 'INVOICE_VOIDED',
            actorUserId: actor.sub,
            targetType: 'invoice',
            targetId: invoiceId,
            metadata: { reason: dto.reason },
          },
          tx,
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
}
