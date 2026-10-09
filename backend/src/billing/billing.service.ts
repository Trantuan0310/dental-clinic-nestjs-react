import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, InvoiceStatus, EncounterStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly, startOfClinicDay, endOfClinicDay } from '../common/date-range.util';
import { ExpenseService } from '../expense/expense.service';
import {
  INVOICE_ISSUED_EVENT,
  INVOICE_PAYMENT_RECORDED_EVENT,
  INVOICE_PAYMENT_VOIDED_EVENT,
  INVOICE_REFUNDED_EVENT,
  INVOICE_VOIDED_EVENT,
  InvoiceEventBase,
  InvoiceEventLine,
  InvoiceEventStatus,
  InvoiceIssuedEvent,
  InvoicePaymentRecordedEvent,
  InvoicePaymentVoidedEvent,
  InvoiceRefundedEvent,
  InvoiceVoidedEvent,
} from '../common/events/domain-events';
import {
  InvoiceAlreadyExistsException,
  InvoiceCorrectionException,
  InvoiceDiscountInvalidException,
  InvoiceNotEditableException,
  InvoiceNotFoundException,
  InvoiceVersionMismatchException,
  InvoiceVoidFailedException,
  PaymentExceedsOutstandingException,
  PaymentNotFoundException,
} from './domain/exceptions';
import { allocateNet, discountAmountOf, settle } from './domain/invoice-math';
import {
  IssueInvoiceDto,
  RecordPaymentDto,
  RefundDto,
  ReissueInvoiceDto,
  UpdateDiscountDto,
  UpdateInvoiceItemDto,
  UpdateInvoiceNotesDto,
  VoidInvoiceDto,
  VoidPaymentDto,
} from './dto/billing.dto';

type DraftLine = {
  treatmentId: string;
  procedure: string;
  description: string | null;
  unitPrice: number;
  /** Defaults to 1 for events queued before treatments had a quantity. */
  quantity?: number;
};

type InvoiceForEvent = Prisma.InvoiceGetPayload<{
  include: { items: true; encounter: { select: { dentistId: true } } };
}>;

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

/** Backfill (cron) only looks at encounters closed this long ago at least… */
const BACKFILL_GRACE_MS = 10 * 60_000;
/** …and not older than this. */
const BACKFILL_WINDOW_DAYS = 30;

const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)}đ`;

/**
 * BillingService — invoice lifecycle:
 *   - createDraftFromEncounter (on ENCOUNTER_CLOSED_EVENT, the reconciliation
 *     cron, "tạo bù" and "lập lại hóa đơn")
 *   - updateDiscount / updateNotes / updateItem while DRAFT (version-locked)
 *   - issue (DRAFT → ISSUED, or PAID for a 0đ invoice)
 *   - recordPayment / refund / voidPayment → paidAmount, refundedAmount,
 *     status ISSUED|PARTIAL|PAID
 *   - voidInvoice (no money kept on it), reissue (new DRAFT replacing it)
 * Each committed change emits an invoice.* domain event (domain-events.ts).
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
    private readonly events: EventEmitter2,
  ) {}

  // ==========================================================================
  // Public API
  // ==========================================================================

  async generateInvoiceCode(): Promise<string> {
    // Clinic calendar year: 00:00–06:59 on 1 January is already the new year (A2-27).
    const year = clinicDateOnly().slice(0, 4);
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

  /** The encounter's invoice that counts (at most one is not VOIDED, migration 045). */
  private activeInvoiceOf(db: Prisma.TransactionClient | PrismaService, encounterId: string) {
    return db.invoice.findFirst({
      where: { encounterId, deletedAt: null, status: { not: InvoiceStatus.VOIDED } },
    });
  }

  /**
   * DRAFT invoice from a closed encounter's treatments. Idempotent: returns
   * the encounter's non-voided invoice when it already has one.
   * Returns null when there is nothing to bill (no treatments, A5-17) or when
   * the encounter's invoice was voided and this is not a deliberate
   * re-issue (`replacesInvoiceId`): voiding is a decision, never undone here.
   */
  async createDraftFromEncounter(
    encounterId: string,
    treatments: DraftLine[],
    opts: { replacesInvoiceId?: string; actorId?: string; reason?: string } = {},
  ) {
    const existing = await this.activeInvoiceOf(this.prisma, encounterId);
    if (existing) return existing;
    if (!opts.replacesInvoiceId) {
      const voided = await this.prisma.invoice.findFirst({
        where: { encounterId, status: InvoiceStatus.VOIDED },
        select: { id: true },
      });
      if (voided) return null;
    }
    if (treatments.length === 0) return null;

    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) return null;

    const code = await this.generateInvoiceCode();
    const lineTotal = (t: { unitPrice: number; quantity?: number }) =>
      t.unitPrice * (t.quantity ?? 1);
    const subtotal = treatments.reduce((acc, t) => acc + lineTotal(t), 0);

    try {
      return await this.prisma.$transaction(async tx => {
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
            createdBy: opts.actorId ?? null,
            replacesInvoiceId: opts.replacesInvoiceId ?? null,
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
            action: opts.replacesInvoiceId ? 'REISSUED' : 'DRAFTED_FROM_ENCOUNTER',
            actorId: opts.actorId ?? encounter.dentistId,
            after: {
              subtotal,
              code,
              ...(opts.replacesInvoiceId && { replacesInvoiceId: opts.replacesInvoiceId }),
              ...(opts.reason && { reason: opts.reason }),
            },
          },
        });
        return invoice;
      }, SERIALIZABLE);
    } catch (err) {
      // Two writers raced (listener vs cron vs "tạo bù"): the partial unique
      // index kept one invoice; hand that one back.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.activeInvoiceOf(this.prisma, encounterId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  /** Billable lines of a closed encounter, as the close event would carry them. */
  private async encounterLines(encounterId: string): Promise<DraftLine[]> {
    const rows = await this.prisma.treatment.findMany({
      where: { encounterId, deletedAt: null },
      orderBy: { sequence: 'asc' },
    });
    return rows.map(t => ({
      treatmentId: t.id,
      procedure: t.procedure,
      description: t.description,
      unitPrice: Number(t.unitPrice),
      quantity: t.quantity,
    }));
  }

  /**
   * "Tạo bù": DRAFT invoice for a COMPLETED encounter that has none (the
   * close listener failed, A2-03). Idempotent: an existing invoice is returned.
   */
  async createFromEncounter(encounterId: string, actor: JwtPayload) {
    const existing = await this.activeInvoiceOf(this.prisma, encounterId);
    if (existing) return { invoice: await this.getInvoiceById(existing.id), created: false };

    const encounter = await this.prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) throw new NotFoundException('Không tìm thấy phiên khám');
    if (encounter.status !== EncounterStatus.COMPLETED) {
      throw new InvoiceCorrectionException(
        'ENCOUNTER_NOT_COMPLETED',
        'Phiên khám chưa đóng. Hóa đơn được lập khi bác sĩ đóng phiên khám.',
      );
    }
    const voided = await this.prisma.invoice.findFirst({
      where: { encounterId, status: InvoiceStatus.VOIDED },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true },
    });
    if (voided) {
      throw new InvoiceCorrectionException(
        'INVOICE_REISSUE_REQUIRED',
        `Hóa đơn ${voided.code} của phiên khám này đã bị hủy. Mở hóa đơn đó và chọn "Lập lại hóa đơn".`,
        { voidedInvoiceId: voided.id },
      );
    }
    const created = await this.createDraftFromEncounter(
      encounterId,
      await this.encounterLines(encounterId),
      { actorId: actor.sub },
    );
    if (!created) {
      throw new InvoiceCorrectionException(
        'ENCOUNTER_NOTHING_TO_BILL',
        'Phiên khám không có thủ thuật nào để tính tiền.',
      );
    }
    await this.audit.log({
      action: 'INVOICE_BACKFILLED',
      actorUserId: actor.sub,
      targetType: 'invoice',
      targetId: created.id,
      metadata: { encounterId, code: created.code },
    });
    return { invoice: await this.getInvoiceById(created.id), created: true };
  }

  /**
   * "Lập lại hóa đơn": a new DRAFT, copied from the encounter's treatments,
   * replacing a VOIDED invoice (A2-02). Idempotent per voided invoice.
   */
  async reissue(invoiceId: string, dto: ReissueInvoiceDto, actor: JwtPayload) {
    const old = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!old || old.deletedAt) throw new InvoiceNotFoundException(invoiceId);
    if (old.status !== InvoiceStatus.VOIDED) {
      throw new InvoiceCorrectionException(
        'INVOICE_NOT_VOIDED',
        'Chỉ lập lại được hóa đơn đã hủy. Hóa đơn nháp thì sửa trực tiếp; hóa đơn đã phát hành thì hủy trước.',
      );
    }
    const replacement = await this.prisma.invoice.findFirst({
      where: { replacesInvoiceId: invoiceId },
    });
    if (replacement) return this.getInvoiceById(replacement.id);
    const active = await this.activeInvoiceOf(this.prisma, old.encounterId);
    if (active) throw new InvoiceAlreadyExistsException(old.encounterId);

    const created = await this.createDraftFromEncounter(
      old.encounterId,
      await this.encounterLines(old.encounterId),
      { replacesInvoiceId: invoiceId, actorId: actor.sub, reason: dto.reason },
    );
    if (!created) {
      throw new InvoiceCorrectionException(
        'ENCOUNTER_NOTHING_TO_BILL',
        'Phiên khám không có thủ thuật nào để tính tiền.',
      );
    }
    await this.audit.log({
      action: 'INVOICE_REISSUED',
      actorUserId: actor.sub,
      targetType: 'invoice',
      targetId: created.id,
      metadata: { replacesInvoiceId: invoiceId, code: created.code, reason: dto.reason },
    });
    return this.getInvoiceById(created.id);
  }

  /**
   * Reconciliation: COMPLETED encounters with something to bill and no
   * non-voided invoice. `voidedInvoice` tells the front desk to re-issue
   * rather than create.
   */
  async listEncountersMissingInvoice() {
    const rows = await this.prisma.encounter.findMany({
      where: {
        status: EncounterStatus.COMPLETED,
        treatments: { some: { deletedAt: null } },
        invoices: { none: { status: { not: InvoiceStatus.VOIDED }, deletedAt: null } },
      },
      orderBy: { closedAt: 'desc' },
      take: 100,
      include: {
        patient: { select: { id: true, code: true, fullName: true } },
        dentist: { select: { id: true, fullName: true } },
        invoices: {
          where: { status: InvoiceStatus.VOIDED },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, code: true, voidReason: true },
        },
      },
    });
    return rows.map(e => ({
      encounterId: e.id,
      closedAt: e.closedAt,
      patientId: e.patient.id,
      patientCode: e.patient.code,
      patientName: e.patient.fullName,
      dentistId: e.dentist.id,
      dentistName: e.dentist.fullName,
      voidedInvoice: e.invoices[0] ?? null,
    }));
  }

  /**
   * Cron: drafts the invoice of encounters closed without one (listener
   * failure, restart right after the close). Encounters whose invoice was
   * voided are only reported: re-issuing is a person's decision.
   */
  async backfillMissingInvoices(now = new Date()) {
    const candidates = await this.prisma.encounter.findMany({
      where: {
        status: EncounterStatus.COMPLETED,
        closedAt: {
          lte: new Date(now.getTime() - BACKFILL_GRACE_MS),
          gte: new Date(now.getTime() - BACKFILL_WINDOW_DAYS * 86_400_000),
        },
        treatments: { some: { deletedAt: null } },
        invoices: { none: {} },
      },
      select: { id: true },
      take: 200,
    });
    let created = 0;
    for (const e of candidates) {
      try {
        const inv = await this.createDraftFromEncounter(e.id, await this.encounterLines(e.id));
        if (inv) created++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Backfill invoice for encounter ${e.id} failed: ${msg}`);
      }
    }
    const voidedOnly = await this.prisma.encounter.count({
      where: {
        status: EncounterStatus.COMPLETED,
        treatments: { some: { deletedAt: null } },
        invoices: { some: {}, none: { status: { not: InvoiceStatus.VOIDED } } },
      },
    });
    return { checked: candidates.length, created, voidedWithoutReplacement: voidedOnly };
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
          items: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
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
        items: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: {
            receivedByUser: { select: { fullName: true, email: true } },
            voidedByUser: { select: { fullName: true } },
          },
        },
        replaces: { select: { id: true, code: true } },
        replacedBy: { select: { id: true, code: true, status: true } },
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
      // The invoice that counts first; a voided one only when nothing replaced it.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { items: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } } },
    });
  }

  // ==========================================================================
  // Domain events
  // ==========================================================================

  private loadForEvent(tx: Prisma.TransactionClient, invoiceId: string) {
    return tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        items: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
        encounter: { select: { dentistId: true } },
      },
    });
  }

  private eventBase(inv: InvoiceForEvent, actorId: string, occurredAt: Date): InvoiceEventBase {
    const subtotal = Number(inv.subtotal);
    const total = Number(inv.total);
    return {
      invoiceId: inv.id,
      invoiceCode: inv.code,
      encounterId: inv.encounterId,
      patientId: inv.patientId,
      dentistId: inv.encounter.dentistId,
      status: inv.status as InvoiceEventStatus,
      subtotal,
      discountAmount: subtotal - total,
      total,
      paidAmount: Number(inv.paidAmount),
      refundedAmount: Number(inv.refundedAmount),
      outstandingAmount: Number(inv.outstandingAmount),
      issuedAt: inv.issuedAt,
      replacesInvoiceId: inv.replacesInvoiceId,
      actorId,
      occurredAt,
    };
  }

  private eventLines(inv: InvoiceForEvent): InvoiceEventLine[] {
    const items = inv.items.filter(i => !i.deletedAt);
    const net = allocateNet(
      items.map(i => Number(i.lineTotal)),
      Number(inv.total),
    );
    return items.map((i, idx) => ({
      invoiceItemId: i.id,
      treatmentId: i.treatmentId,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      netLineTotal: net[idx],
    }));
  }

  /** After commit only; a listener error must not undo or fail the change. */
  private emit(event: string, payload: object) {
    try {
      this.events.emit(event, payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Listener of ${event} failed: ${msg}`);
    }
  }

  /**
   * Nobody else can do it: lets the only holder of a correction permission
   * act on their own payment rather than be stuck (A6-xet-A2 §2.1).
   */
  private async isSoleHolder(
    tx: Prisma.TransactionClient,
    permission: string,
    actorId: string,
  ): Promise<boolean> {
    const others = await tx.user.count({
      where: {
        id: { not: actorId },
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              deletedAt: null,
              rolePermissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
    });
    return others === 0;
  }

  /** Acting on one's own collection (sole holder): a fuller reason, like payroll self-approval. */
  private assertSelfReason(reason: string) {
    if (reason.trim().length < 10) {
      throw new InvoiceCorrectionException(
        'SELF_CORRECTION_REASON_REQUIRED',
        'Bạn đang sửa tiền do chính mình thu: ghi lý do cụ thể, ít nhất 10 ký tự (được lưu riêng trong nhật ký).',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: JwtPayload) {
    const { updated, event } = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status === InvoiceStatus.VOIDED) {
        throw new InvoiceNotEditableException(inv.status);
      }
      if (inv.status === InvoiceStatus.DRAFT) {
        throw new InvoiceNotEditableException(
          inv.status,
          'Hóa đơn còn nháp: bấm "Phát hành" trước khi thu tiền.',
        );
      }
      const requested = Number(dto.amount);
      const outstanding = Number(inv.outstandingAmount);
      if (requested > outstanding) {
        throw new PaymentExceedsOutstandingException(requested, outstanding);
      }

      const newPaid = Number(inv.paidAmount) + requested;
      const { outstanding: newOutstanding, status: newStatus } = settle(
        Number(inv.total),
        newPaid,
        Number(inv.refundedAmount),
      );

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
          kind: PaymentKind.PAYMENT,
          status: PaymentStatus.COMPLETED,
          note: dto.note ?? null,
          receivedBy: actor.sub,
        },
      });

      const updated = await this.loadForEvent(tx, invoiceId);

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
            paidAmount: updated.paidAmount,
            outstanding: updated.outstandingAmount,
            paymentId: payment.id,
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

      const event: InvoicePaymentRecordedEvent = {
        ...this.eventBase(updated, actor.sub, payment.paidAt),
        paymentId: payment.id,
        amount: requested,
        method: dto.method,
        paidAt: payment.paidAt,
      };
      return { updated, event };
      // Serializable: guards against two concurrent payments both reading the
      // same outstandingAmount and over-deducting. Combined with the
      // `updateMany` version-guarded write, the application cannot reach a
      // negative outstandingAmount even under contention.
    }, SERIALIZABLE);
    this.emit(INVOICE_PAYMENT_RECORDED_EVENT, event);
    const { items: _items, encounter: _enc, ...invoice } = updated;
    return invoice;
  }

  /**
   * "Hủy phiếu thu": cancels a payment (or refund) row entered by mistake, as
   * if it had never been recorded. The person who took the money may not
   * cancel it themselves unless nobody else holds the permission.
   */
  async voidPayment(paymentId: string, dto: VoidPaymentDto, actor: JwtPayload) {
    const { event } = await this.prisma.$transaction(async tx => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      });
      if (!payment || payment.invoice.deletedAt) throw new PaymentNotFoundException(paymentId);
      const inv = payment.invoice;
      if (payment.status === PaymentStatus.VOIDED) {
        throw new InvoiceCorrectionException(
          'PAYMENT_ALREADY_VOIDED',
          'Phiếu này đã được hủy trước đó.',
        );
      }
      if (inv.status === InvoiceStatus.VOIDED) {
        throw new InvoiceCorrectionException(
          'INVOICE_ALREADY_VOIDED',
          'Hóa đơn đã bị hủy nên không sửa phiếu thu của hóa đơn này được nữa.',
        );
      }
      const selfVoid = payment.receivedBy === actor.sub;
      if (selfVoid) {
        if (!(await this.isSoleHolder(tx, 'invoice.payment.void', actor.sub))) {
          throw new InvoiceCorrectionException(
            'PAYMENT_SELF_VOID_FORBIDDEN',
            'Bạn không thể tự hủy phiếu do chính mình lập. Nhờ một quản trị viên khác hủy phiếu này.',
            undefined,
            HttpStatus.FORBIDDEN,
          );
        }
        this.assertSelfReason(dto.reason);
      }

      const amount = Number(payment.amount);
      const isRefund = payment.kind === PaymentKind.REFUND;
      const newPaid = Number(inv.paidAmount) + (isRefund ? amount : -amount);
      const newRefunded = Number(inv.refundedAmount) - (isRefund ? amount : 0);
      if (newPaid < 0) {
        throw new InvoiceCorrectionException(
          'PAYMENT_ALREADY_REFUNDED',
          `Tiền của phiếu thu này đã được hoàn cho bệnh nhân (đang giữ ${vnd(Number(inv.paidAmount))}). Hủy phiếu hoàn trước nếu phiếu hoàn cũng là nhầm.`,
        );
      }
      const { outstanding, status } = settle(Number(inv.total), newPaid, newRefunded);

      const guarded = await tx.invoice.updateMany({
        where: { id: inv.id, version: inv.version },
        data: {
          paidAmount: new Prisma.Decimal(newPaid),
          refundedAmount: new Prisma.Decimal(newRefunded),
          outstandingAmount: new Prisma.Decimal(outstanding),
          status,
          version: { increment: 1 },
        },
      });
      if (guarded.count === 0) throw new InvoiceVersionMismatchException(inv.version, -1);

      const voidedAt = new Date();
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.VOIDED,
          voidedAt,
          voidedBy: actor.sub,
          voidReason: dto.reason,
        },
      });
      await tx.invoiceAudit.create({
        data: {
          invoiceId: inv.id,
          action: isRefund ? 'REFUND_VOIDED' : 'PAYMENT_VOIDED',
          actorId: actor.sub,
          before: {
            paymentId,
            amount,
            paidAmount: inv.paidAmount,
            refundedAmount: inv.refundedAmount,
            outstanding: inv.outstandingAmount,
            status: inv.status,
          },
          after: {
            paidAmount: newPaid,
            refundedAmount: newRefunded,
            outstanding,
            status,
            reason: dto.reason,
          },
        },
      });
      await this.audit.log(
        {
          // Nobody else could do it: kept apart so the owner can review it.
          action: selfVoid ? 'PAYMENT_SELF_VOIDED' : 'INVOICE_PAYMENT_VOIDED',
          actorUserId: actor.sub,
          targetType: 'invoice',
          targetId: inv.id,
          metadata: {
            paymentId,
            kind: payment.kind,
            amount,
            receivedBy: payment.receivedBy,
            reason: dto.reason,
            ...(selfVoid && { soleHolder: true }),
          },
        },
        tx,
      );
      const updated = await this.loadForEvent(tx, inv.id);
      const event: InvoicePaymentVoidedEvent = {
        ...this.eventBase(updated, actor.sub, voidedAt),
        paymentId,
        kind: payment.kind,
        amount,
        paidAt: payment.paidAt,
        reason: dto.reason,
      };
      return { event };
    }, SERIALIZABLE);
    this.emit(INVOICE_PAYMENT_VOIDED_EVENT, event);
    return this.getInvoiceById(event.invoiceId);
  }

  /**
   * "Hoàn tiền": money handed back to the patient, recorded as a REFUND row
   * dated today. It lowers what the clinic kept without reopening the debt;
   * to cancel the invoice afterwards, void it once nothing is kept on it.
   */
  async refund(invoiceId: string, dto: RefundDto, actor: JwtPayload) {
    const { event } = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv || inv.deletedAt) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status === InvoiceStatus.DRAFT || inv.status === InvoiceStatus.VOIDED) {
        throw new InvoiceNotEditableException(inv.status);
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      const paid = Number(inv.paidAmount);
      if (dto.amount > paid) {
        throw new InvoiceCorrectionException(
          'REFUND_EXCEEDS_PAID',
          `Số tiền hoàn ${vnd(dto.amount)} lớn hơn số phòng khám đang giữ của hóa đơn này (${vnd(paid)}).`,
          { requested: dto.amount, paid },
        );
      }
      const ownCollection = await tx.payment.count({
        where: {
          invoiceId,
          kind: PaymentKind.PAYMENT,
          status: PaymentStatus.COMPLETED,
          receivedBy: actor.sub,
        },
      });
      const selfRefund = ownCollection > 0;
      if (selfRefund) {
        if (!(await this.isSoleHolder(tx, 'invoice.refund', actor.sub))) {
          throw new InvoiceCorrectionException(
            'REFUND_SELF_FORBIDDEN',
            'Bạn đã thu tiền hóa đơn này nên không tự lập phiếu hoàn. Nhờ một quản trị viên khác thực hiện.',
            undefined,
            HttpStatus.FORBIDDEN,
          );
        }
        this.assertSelfReason(dto.reason);
      }

      const newPaid = paid - dto.amount;
      const newRefunded = Number(inv.refundedAmount) + dto.amount;
      const { outstanding, status } = settle(Number(inv.total), newPaid, newRefunded);
      const guarded = await tx.invoice.updateMany({
        where: { id: invoiceId, version: inv.version },
        data: {
          paidAmount: new Prisma.Decimal(newPaid),
          refundedAmount: new Prisma.Decimal(newRefunded),
          outstandingAmount: new Prisma.Decimal(outstanding),
          status,
          version: { increment: 1 },
        },
      });
      if (guarded.count === 0) throw new InvoiceVersionMismatchException(dto.version, -1);

      const row = await tx.payment.create({
        data: {
          invoiceId,
          amount: dto.amount,
          method: dto.method,
          kind: PaymentKind.REFUND,
          status: PaymentStatus.COMPLETED,
          note: dto.reason,
          receivedBy: actor.sub,
        },
      });
      await tx.invoiceAudit.create({
        data: {
          invoiceId,
          action: 'REFUNDED',
          actorId: actor.sub,
          before: { paidAmount: inv.paidAmount, refundedAmount: inv.refundedAmount },
          after: {
            paidAmount: newPaid,
            refundedAmount: newRefunded,
            refundId: row.id,
            amount: dto.amount,
            reason: dto.reason,
          },
        },
      });
      await this.audit.log(
        {
          action: selfRefund ? 'INVOICE_SELF_REFUND' : 'INVOICE_REFUNDED',
          actorUserId: actor.sub,
          targetType: 'invoice',
          targetId: invoiceId,
          metadata: {
            ...(selfRefund && { soleHolder: true }),
            refundId: row.id,
            amount: dto.amount,
            method: dto.method,
            reason: dto.reason,
          },
        },
        tx,
      );
      const updated = await this.loadForEvent(tx, invoiceId);
      const event: InvoiceRefundedEvent = {
        ...this.eventBase(updated, actor.sub, row.paidAt),
        paymentId: row.id,
        amount: dto.amount,
        method: dto.method,
        refundedAt: row.paidAt,
        reason: dto.reason,
      };
      return { event };
    }, SERIALIZABLE);
    this.emit(INVOICE_REFUNDED_EVENT, event);
    return this.getInvoiceById(invoiceId);
  }

  async updateDiscount(invoiceId: string, dto: UpdateDiscountDto, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new InvoiceNotEditableException(
          inv.status,
          'Chỉ giảm giá được khi hóa đơn còn nháp. Hóa đơn đã phát hành thì hủy rồi lập lại.',
        );
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      if (dto.discountValue > 0 && (dto.reason ?? '').length < 3) {
        throw new InvoiceDiscountInvalidException('Nhập lý do giảm giá');
      }
      if (dto.discountType === 'PERCENT' && dto.discountValue > 100) {
        throw new InvoiceDiscountInvalidException('Phần trăm giảm phải từ 0 đến 100');
      }
      if (dto.discountType === 'AMOUNT' && dto.discountValue > Number(inv.subtotal)) {
        throw new InvoiceDiscountInvalidException('Số tiền giảm không được lớn hơn tổng hóa đơn');
      }
      if (dto.discountType === 'AMOUNT' && !Number.isInteger(dto.discountValue)) {
        throw new InvoiceDiscountInvalidException('Số tiền giảm phải là số đồng nguyên');
      }

      // Rounded to whole đồng (A2-11): 15% of 333.333đ is 50.000đ, not 49.999,95đ.
      const discountAmount = discountAmountOf(
        Number(inv.subtotal),
        dto.discountType,
        dto.discountValue,
      );
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
            discountAmount,
            ...(dto.reason && { reason: dto.reason }),
          },
        },
      });
      return updated;
    }, SERIALIZABLE);
  }

  /**
   * Fix or drop one line of a DRAFT invoice (wrong price or quantity found
   * after the encounter closed, A2-02). The treatment record is left as the
   * dentist wrote it; the invoice history keeps before/after and the reason.
   */
  async updateItem(
    invoiceId: string,
    itemId: string,
    dto: UpdateInvoiceItemDto,
    actor: JwtPayload,
  ) {
    return this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: { where: { deletedAt: null } } },
      });
      if (!inv || inv.deletedAt) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new InvoiceNotEditableException(
          inv.status,
          'Chỉ sửa dòng được khi hóa đơn còn nháp. Hóa đơn đã phát hành thì hủy rồi "Lập lại hóa đơn".',
        );
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      const item = inv.items.find(i => i.id === itemId);
      if (!item) {
        throw new InvoiceCorrectionException(
          'INVOICE_ITEM_NOT_FOUND',
          'Dòng hóa đơn không tồn tại hoặc đã bị bỏ.',
          undefined,
          HttpStatus.NOT_FOUND,
        );
      }
      const before = {
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      };
      let after: typeof before | null;
      if (dto.remove) {
        if (inv.items.length === 1) {
          throw new InvoiceCorrectionException(
            'INVOICE_LAST_ITEM',
            'Hóa đơn phải còn ít nhất một dòng. Muốn bỏ cả hóa đơn thì chọn "Hủy HĐ".',
          );
        }
        await tx.invoiceItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
        after = null;
      } else {
        const quantity = dto.quantity ?? before.quantity;
        const unitPrice = dto.unitPrice ?? before.unitPrice;
        const description = dto.description ?? before.description;
        if (
          quantity === before.quantity &&
          unitPrice === before.unitPrice &&
          description === before.description
        ) {
          throw new InvoiceCorrectionException(
            'INVOICE_ITEM_UNCHANGED',
            'Dòng hóa đơn không có gì thay đổi.',
          );
        }
        after = { description, quantity, unitPrice, lineTotal: quantity * unitPrice };
        await tx.invoiceItem.update({
          where: { id: itemId },
          data: {
            description,
            quantity: new Prisma.Decimal(quantity),
            unitPrice: new Prisma.Decimal(unitPrice),
            lineTotal: new Prisma.Decimal(after.lineTotal),
          },
        });
      }

      const subtotal =
        inv.items.reduce((acc, i) => acc + Number(i.lineTotal), 0) -
        before.lineTotal +
        (after?.lineTotal ?? 0);
      const discountValue = inv.discountValue === null ? null : Number(inv.discountValue);
      if (inv.discountType === 'AMOUNT' && (discountValue ?? 0) > subtotal) {
        throw new InvoiceCorrectionException(
          'INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL',
          `Giảm giá ${vnd(discountValue ?? 0)} lớn hơn tổng mới ${vnd(subtotal)}. Sửa giảm giá trước.`,
        );
      }
      const total = subtotal - discountAmountOf(subtotal, inv.discountType, discountValue);
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          outstandingAmount: new Prisma.Decimal(total - Number(inv.paidAmount)),
          version: { increment: 1 },
        },
      });
      await tx.invoiceAudit.create({
        data: {
          invoiceId,
          action: dto.remove ? 'ITEM_REMOVED' : 'ITEM_UPDATED',
          actorId: actor.sub,
          before: { itemId, ...before, subtotal: inv.subtotal, total: inv.total },
          after: { itemId, ...(after ?? {}), subtotal, total, reason: dto.reason },
        },
      });
      await this.audit.log(
        {
          action: 'INVOICE_ITEM_UPDATED',
          actorUserId: actor.sub,
          targetType: 'invoice',
          targetId: invoiceId,
          metadata: {
            itemId,
            treatmentId: item.treatmentId,
            removed: !!dto.remove,
            before,
            after,
            reason: dto.reason,
          },
        },
        tx,
      );
      return updated;
    }, SERIALIZABLE);
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
      SERIALIZABLE,
    );
  }

  /** DRAFT → ISSUED; a 0đ invoice has nothing to collect and goes straight to PAID (A2-09). */
  async issue(invoiceId: string, dto: IssueInvoiceDto, actor: JwtPayload) {
    const { updated, event } = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status !== InvoiceStatus.DRAFT) {
        throw new InvoiceNotEditableException(inv.status);
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      const free = Number(inv.total) <= 0;
      const status = free ? InvoiceStatus.PAID : InvoiceStatus.ISSUED;
      const issuedAt = new Date();
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          issuedAt,
          issuedBy: actor.sub,
          ...(free && { outstandingAmount: new Prisma.Decimal(0) }),
          version: { increment: 1 },
        },
      });
      await tx.invoiceAudit.create({
        data: {
          invoiceId,
          action: 'ISSUED',
          actorId: actor.sub,
          before: { status: 'DRAFT' },
          after: { status, ...(free && { note: 'Hóa đơn 0đ — không phát sinh thu' }) },
        },
      });
      const updated = await this.loadForEvent(tx, invoiceId);
      const event: InvoiceIssuedEvent = {
        ...this.eventBase(updated, actor.sub, issuedAt),
        lines: this.eventLines(updated),
      };
      return { updated, event };
    }, SERIALIZABLE);
    this.emit(INVOICE_ISSUED_EVENT, event);
    const { items: _items, encounter: _enc, ...invoice } = updated;
    return invoice;
  }

  async voidInvoice(invoiceId: string, dto: VoidInvoiceDto, actor: JwtPayload) {
    const { updated, event } = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new InvoiceNotFoundException(invoiceId);
      if (inv.status === InvoiceStatus.VOIDED) {
        throw new InvoiceVoidFailedException('Hóa đơn đã bị hủy trước đó.');
      }
      // Only once no money is kept: every receipt was cancelled (entered by
      // mistake) or handed back in full. Checked on the rows, not only on the
      // paid_amount column, so a stale column cannot let money vanish.
      const rows = await tx.payment.groupBy({
        by: ['kind'],
        where: { invoiceId, status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const sumOf = (kind: PaymentKind) =>
        Number(rows.find(r => r.kind === kind)?._sum.amount ?? 0);
      const kept = sumOf(PaymentKind.PAYMENT) - sumOf(PaymentKind.REFUND);
      if (kept > 0 || Number(inv.paidAmount) > 0) {
        const openReceipts = rows.find(r => r.kind === PaymentKind.PAYMENT)?._count._all ?? 0;
        throw new InvoiceVoidFailedException(
          `Hóa đơn còn ${vnd(Math.max(kept, Number(inv.paidAmount)))} đã thu (${openReceipts} phiếu thu còn hiệu lực). ` +
            'Làm trước một trong hai bước: thu nhầm thì "Hủy phiếu thu (ghi nhầm)"; đã trả lại tiền cho khách thì "Hoàn tiền" hết số đã thu. Sau đó mới hủy hóa đơn.',
        );
      }
      if (inv.version !== dto.version) {
        throw new InvoiceVersionMismatchException(dto.version, inv.version);
      }
      const voidedAt = new Date();
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.VOIDED,
          voidedAt,
          voidedBy: actor.sub,
          voidReason: dto.reason,
          outstandingAmount: new Prisma.Decimal(0),
          version: { increment: 1 },
        },
      });
      await tx.invoiceAudit.create({
        data: {
          invoiceId,
          action: 'VOIDED',
          actorId: actor.sub,
          before: {
            status: inv.status,
            outstanding: inv.outstandingAmount,
            // Fully refunded: receipts and refunds stay COMPLETED and net to 0.
            refundedAmount: inv.refundedAmount,
          },
          after: { status: 'VOIDED', reason: dto.reason },
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
      const updated = await this.loadForEvent(tx, invoiceId);
      const event: InvoiceVoidedEvent = {
        ...this.eventBase(updated, actor.sub, voidedAt),
        reason: dto.reason,
        previousStatus: inv.status as InvoiceEventStatus,
        lines: this.eventLines(updated),
      };
      return { updated, event };
    }, SERIALIZABLE);
    this.emit(INVOICE_VOIDED_EVENT, event);
    const { items: _items, encounter: _enc, ...invoice } = updated;
    return invoice;
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
