import { InvoiceStatus, PaymentKind, PaymentStatus, Prisma } from '@prisma/client';

/**
 * H7 / A6-08 — the ONE definition of revenue and collections used by the
 * Reports page, the Dashboard and (later) ISSUED_NET commission.
 *
 *   - Revenue ("Doanh thu", "Doanh số") = invoices that were issued:
 *     ISSUED / PARTIAL / PAID, dated by `issuedAt` (clinic time). DRAFT and
 *     VOIDED are never summed — they only appear in their own "not counted"
 *     box.
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

export const REVENUE_INVOICE_WHERE = {
  deletedAt: null,
  status: { in: REVENUE_INVOICE_STATUSES },
  issuedAt: { not: null },
} satisfies Prisma.InvoiceWhereInput;

/** {@link REVENUE_INVOICE_WHERE} limited to invoices issued in [from, to]. */
export function revenueInvoiceWhere(from: Date, to: Date): Prisma.InvoiceWhereInput {
  return { ...REVENUE_INVOICE_WHERE, issuedAt: { not: null, gte: from, lte: to } };
}

/** The same rule as SQL for raw aggregates; `alias` is the invoices alias. */
export function revenueInvoiceSql(alias: string, from: Date, to: Date): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Bad SQL alias: ${alias}`);
  const a = Prisma.raw(alias);
  return Prisma.sql`${a}."deleted_at" IS NULL
    AND ${a}."status"::text IN (${Prisma.join(REVENUE_INVOICE_STATUSES)})
    AND ${a}."issued_at" IS NOT NULL
    AND ${a}."issued_at" >= ${from}
    AND ${a}."issued_at" <= ${to}`;
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
 * total − refunds, by refund date). Refunds on a VOIDED invoice are left
 * out: that invoice is not revenue at all, so they would count twice.
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
    invoice: { deletedAt: null, status: { in: REVENUE_INVOICE_STATUSES }, ...invoice },
  };
}

/**
 * Revenue movements as SQL rows (invoice_id, at, amount, cnt): each issued
 * invoice at its issue time (+total, cnt 1) and each refund on a counted
 * invoice at its refund time (−amount, cnt 0). Aggregates group these.
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
      AND i."deleted_at" IS NULL
      AND i."status"::text IN (${Prisma.join(REVENUE_INVOICE_STATUSES)})
  )`;
}
