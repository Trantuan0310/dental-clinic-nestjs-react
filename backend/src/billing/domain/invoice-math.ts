import { InvoiceStatus } from '@prisma/client';

/**
 * Money rules shared by every invoice change. VND has no subunit, so amounts
 * computed here are rounded to whole đồng (A2-11); a remainder below 1đ left
 * by older decimal invoices counts as settled.
 */
export const SETTLED_BELOW = 1;

export function discountAmountOf(
  subtotal: number,
  type: 'PERCENT' | 'AMOUNT' | null | undefined,
  value: number | null | undefined,
): number {
  if (!type || !value) return 0;
  return type === 'PERCENT' ? Math.round((subtotal * value) / 100) : value;
}

/**
 * Outstanding and status of an issued invoice. `paid` is the net money kept
 * (payments − refunds); a refund does not reopen the debt, so outstanding is
 * total − (paid + refunded).
 */
export function settle(
  total: number,
  paid: number,
  refunded: number,
): { outstanding: number; status: InvoiceStatus } {
  const outstanding = Math.max(0, total - paid - refunded);
  const status =
    outstanding < SETTLED_BELOW
      ? InvoiceStatus.PAID
      : paid + refunded > 0
        ? InvoiceStatus.PARTIAL
        : InvoiceStatus.ISSUED;
  return { outstanding, status };
}

/**
 * Splits `total` over the lines pro rata to their lineTotal, in whole đồng;
 * the rounding remainder goes to the largest line so the parts add up to
 * `total` exactly. This is the per-line amount after the invoice discount.
 */
export function allocateNet(lineTotals: number[], total: number): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  if (lineTotals.length === 0) return [];
  if (subtotal <= 0) return lineTotals.map(() => 0);
  const parts = lineTotals.map(t => Math.round((t * total) / subtotal));
  const diff = Math.round(total) - parts.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    let largest = 0;
    lineTotals.forEach((t, i) => {
      if (t > lineTotals[largest]) largest = i;
    });
    parts[largest] += diff;
  }
  return parts;
}
