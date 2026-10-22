import { InvoiceStatus, PaymentKind, PaymentStatus, Prisma } from '@prisma/client';

/**
 * H7 / A6-08 — the ONE definition of revenue and collections used by the
 * Reports page, the Dashboard and (later) ISSUED_NET commission.
 *
 *   - Revenue ("Doanh thu", "Doanh số") = invoices that were issued, dated by
 *     `issuedAt` (clinic time), minus refunds dated by the refund's `paidAt`.
 *     Voiding an issued invoice takes back what was left of it (total −
 *     refunds) on `voidedAt`, like a refund: a month already closed never
 *     changes (5.3). DRAFT, and VOIDED never issued, are never summed — they
 *     only appear in their own "not counted" box.
 *   - Collected ("Đã thu") = payments dated by `paidAt`, minus refunds dated
 *     by the refund's own `paidAt` (a refund next month lowers next month,
 *     never rewrites a closed month). Voided payments (a mistake undone)
 *     count nowhere.
 */
export const REVENUE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIAL,
  InvoiceStatus.PAID,
];

/**
 * Invoices that count at their issue date: still live, or voided after being
 * issued (voidedAt set; that void is reversed by {@link voidedRevenueWhere}).
 */
export const REVENUE_INVOICE_WHERE = {
  deletedAt: null,
  issuedAt: { not: null },
  OR: [
    { status: { in: REVENUE_INVOICE_STATUSES } },
    { status: InvoiceStatus.VOIDED, voidedAt: { not: null } },
  ],
} satisfies Prisma.InvoiceWhereInput;

/** {@link REVENUE_INVOICE_WHERE} limited to invoices issued in [from, to]. */
export function revenueInvoiceWhere(from: Date, to: Date): Prisma.InvoiceWhereInput {
  return { ...REVENUE_INVOICE_WHERE, issuedAt: { not: null, gte: from, lte: to } };
}

/** The same test on a loaded invoice. */
export function countsAsRevenue(inv: {
  status: InvoiceStatus;
  issuedAt: Date | null;
  voidedAt: Date | null;
}): boolean {
  if (!inv.issuedAt) return false;
  return (
    REVENUE_INVOICE_STATUSES.includes(inv.status) ||
    (inv.status === InvoiceStatus.VOIDED && !!inv.voidedAt)
  );
}

/** Issued invoices voided in [from, to]: their revenue is taken back that day. */
export function voidedRevenueWhere(
  from: Date,
  to: Date,
  invoice: Prisma.InvoiceWhereInput = {},
): Prisma.InvoiceWhereInput {
  return {
    deletedAt: null,
    status: InvoiceStatus.VOIDED,
    issuedAt: { not: null },
    voidedAt: { gte: from, lte: to },
    ...invoice,
  };
}

/**
 * What a void takes back (≤ 0): the total less the refunds already counted.
 * Voiding needs nothing kept, so payments and refunds have netted out.
 */
export function voidReversalAmount(inv: {
  total: Prisma.Decimal | number | string;
  refundedAmount: Prisma.Decimal | number | string;
}): number {
  return -(Number(inv.total ?? 0) - Number(inv.refundedAmount ?? 0));
}

/** The same rule as SQL for raw aggregates; `alias` is the invoices alias. */
export function revenueInvoiceSql(alias: string, from: Date, to: Date): Prisma.Sql {
  const a = sqlAlias(alias);
  return Prisma.sql`${countsAsRevenueSql(a)}
    AND ${a}."issued_at" >= ${from}
    AND ${a}."issued_at" <= ${to}`;
}

function sqlAlias(alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Bad SQL alias: ${alias}`);
  return Prisma.raw(alias);
}

/** {@link REVENUE_INVOICE_WHERE} without dates, as SQL. */
function countsAsRevenueSql(a: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${a}."deleted_at" IS NULL
    AND ${a}."issued_at" IS NOT NULL
    AND (${a}."status"::text IN (${Prisma.join(REVENUE_INVOICE_STATUSES)})
      OR (${a}."status"::text = 'VOIDED' AND ${a}."voided_at" IS NOT NULL))`;
}

// ---------------------------------------------------------------------------
// Collections and refunds (H6, billing migration 045): `payments.kind`
// PAYMENT | REFUND (amount positive, paidAt = refund date), a voided receipt
// has status VOIDED and voidedAt set and counts nowhere.
// ---------------------------------------------------------------------------

/** Payments that count towards "Đã thu" (refunds included, signed later). */
export function collectedPaymentWhere(
  from: Date,
  to: Date,
  invoice: Prisma.InvoiceWhereInput = {},
): Prisma.PaymentWhereInput {
  // Includes receipts of an invoice voided after a full refund: payment and
  // refund both stay COMPLETED and net to zero, each on its own date.
  return {
    status: PaymentStatus.COMPLETED,
    voidedAt: null,
    paidAt: { gte: from, lte: to },
    invoice: { deletedAt: null, ...invoice },
  };
}

/** + for a payment, − for a refund. */
export function signedPaymentAmount(row: {
  amount: Prisma.Decimal | number | string;
  kind: PaymentKind;
}): number {
  const amount = Number(row.amount ?? 0);
  return row.kind === PaymentKind.REFUND ? -amount : amount;
}

/**
 * Refunds that lower revenue (same basis as ISSUED_NET commission:
 * total − refunds, by refund date), on any invoice counted at issue — a
 * voided one included, since its void only takes back what refunds left.
 */
export function revenueRefundWhere(
  from: Date,
  to: Date,
  invoice: Prisma.InvoiceWhereInput = {},
): Prisma.PaymentWhereInput {
  return {
    kind: PaymentKind.REFUND,
    status: PaymentStatus.COMPLETED,
    voidedAt: null,
    paidAt: { gte: from, lte: to },
    invoice: { ...REVENUE_INVOICE_WHERE, ...invoice },
  };
}

/**
 * Revenue movements as SQL rows (invoice_id, at, amount, cnt): each issued
 * invoice at its issue time (+total, cnt 1), each refund on it at its refund
 * time (−amount, cnt 0) and its void at the void time (−(total − refunds),
 * cnt 0). Aggregates group these; a voided invoice's rows net to zero.
 */
export function revenueRowsSql(from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`(
    SELECT i.id AS invoice_id, i."issued_at" AS at, i."total" AS amount, 1 AS cnt
    FROM "invoices" i
    WHERE ${revenueInvoiceSql('i', from, to)}
    UNION ALL
    SELECT i.id, p."paid_at", -p."amount", 0
    FROM "payments" p
    JOIN "invoices" i ON i.id = p."invoice_id"
    WHERE p."kind"::text = 'REFUND'
      AND p."status"::text = 'COMPLETED'
      AND p."voided_at" IS NULL
      AND p."paid_at" >= ${from}
      AND p."paid_at" <= ${to}
      AND ${countsAsRevenueSql(Prisma.raw('i'))}
    UNION ALL
    SELECT i.id, i."voided_at", -(i."total" - i."refunded_amount"), 0
    FROM "invoices" i
    WHERE i."deleted_at" IS NULL
      AND i."status"::text = 'VOIDED'
      AND i."issued_at" IS NOT NULL
      AND i."voided_at" >= ${from}
      AND i."voided_at" <= ${to}
  )`;
}
