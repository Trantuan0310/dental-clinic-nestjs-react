import { clinicDateOnly } from '../common/date-range.util';

export function waterfallSteps(values: Array<{ key: string; amount: number; total?: boolean }>) {
  let balance = 0;
  return values.map(row => {
    const from = row.total ? 0 : balance;
    balance = row.total ? row.amount : balance + row.amount;
    return { ...row, from, to: balance };
  });
}

export const MONTHLY_AGING_BUCKETS = ['D0_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;

/** Refunds reduce cash kept, never reopen debt: subtract receipts, not net cash. */
export function agingSnapshot(
  rows: Array<{
    issuedAt: Date | null;
    voidedAt: Date | null;
    total: unknown;
    payments: Array<{ amount: unknown; paidAt: Date; voidedAt: Date | null }>;
    adjustments: Array<{ amount: unknown; adjustedAt: Date }>;
  }>,
  cutoff: Date,
) {
  const buckets = { D0_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 };
  for (const row of rows) {
    if (!row.issuedAt || row.issuedAt > cutoff || (row.voidedAt && row.voidedAt <= cutoff))
      continue;
    const receipts = row.payments
      .filter(p => p.paidAt <= cutoff && (!p.voidedAt || p.voidedAt > cutoff))
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const adjustments = row.adjustments
      .filter(a => a.adjustedAt <= cutoff)
      .reduce((sum, a) => sum + Number(a.amount), 0);
    const outstanding = Math.max(0, Number(row.total) - receipts - adjustments);
    const age = Math.round(
      (Date.parse(clinicDateOnly(cutoff)) - Date.parse(clinicDateOnly(row.issuedAt))) / 86_400_000,
    );
    buckets[age <= 30 ? 'D0_30' : age <= 60 ? 'D31_60' : age <= 90 ? 'D61_90' : 'D90_PLUS'] +=
      outstanding;
  }
  return { ...buckets, total: Object.values(buckets).reduce((sum, n) => sum + n, 0) };
}
