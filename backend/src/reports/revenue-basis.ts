import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';

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
// Collections. Refund rows and payment voiding (H6) belong to the billing
// team: `payments.kind` PAYMENT | REFUND (amount stays positive) and
// `payments.voided_at`. This module reads them only when the generated client
// has them, so it is correct both before and after that migration lands.
// ---------------------------------------------------------------------------

const PAYMENT_FIELDS = new Set(
  Prisma.dmmf.datamodel.models.find(m => m.name === 'Payment')?.fields.map(f => f.name) ?? [],
);
export const PAYMENT_HAS_KIND = PAYMENT_FIELDS.has('kind');
const PAYMENT_HAS_VOIDED_AT = PAYMENT_FIELDS.has('voidedAt');

export const REFUND_KIND = 'REFUND';

/** Payments that count towards "Đã thu" (refunds included, signed later). */
export function collectedPaymentWhere(
  from: Date,
  to: Date,
  invoice: Prisma.InvoiceWhereInput = {},
): Prisma.PaymentWhereInput {
  return {
    status: PaymentStatus.COMPLETED,
    ...(PAYMENT_HAS_VOIDED_AT ? ({ voidedAt: null } as Prisma.PaymentWhereInput) : {}),
    paidAt: { gte: from, lte: to },
    invoice: { deletedAt: null, ...invoice },
  };
}

/** Extra select so {@link signedPaymentAmount} can tell refunds apart. */
export const PAYMENT_KIND_SELECT = (PAYMENT_HAS_KIND ? { kind: true } : {}) as Prisma.PaymentSelect;

/** + for a payment, − for a refund. */
export function signedPaymentAmount(row: { amount: Prisma.Decimal | number | string }): number {
  const amount = Number(row.amount ?? 0);
  return (row as { kind?: string }).kind === REFUND_KIND ? -amount : amount;
}

export function isRefund(row: object): boolean {
  return (row as { kind?: string }).kind === REFUND_KIND;
}
