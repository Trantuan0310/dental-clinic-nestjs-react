export interface DateRange {
  start: Date;
  end: Date;
  /**
   * True when the compensation has no explicit end date (effective_to = NULL).
   * Such ranges are treated as "open-ended" for pro-ration: the comp covers
   * the entire pay period regardless of calendar end.
   */
  openEnded?: boolean;
}

export const daysBetweenInclusive = (start: Date, end: Date): number => {
  const startDate = new Date(start);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setUTCHours(0, 0, 0, 0);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

export const compRange = (effectiveFrom: Date, effectiveTo: Date | null): DateRange => {
  return {
    start: effectiveFrom,
    end: effectiveTo ?? new Date(),
    openEnded: effectiveTo === null,
  };
};

export const overlapDays = (range1: DateRange, range2: DateRange): number => {
  const effectiveEnd = (r: DateRange): number =>
    r.openEnded
      ? // open-ended ranges have no upper bound; use the other range's end as ceiling
        Math.max(r.start.getTime(), Math.max(range1.end.getTime(), range2.end.getTime()))
      : r.end.getTime();

  const overlapStart = new Date(Math.max(range1.start.getTime(), range2.start.getTime()));
  const overlapEnd = new Date(Math.min(effectiveEnd(range1), effectiveEnd(range2)));

  if (overlapEnd <= overlapStart) return 0;

  return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

export const intersectRange = (a: DateRange, b: DateRange): DateRange | null => {
  const startMs = Math.max(a.start.getTime(), b.start.getTime());
  const endMs = Math.min(a.end.getTime(), b.end.getTime());
  if (endMs < startMs) return null;
  return { start: new Date(startMs), end: new Date(endMs) };
};

export const proRateBaseSalary = (
  monthlySalary: number,
  compensationRange: DateRange,
  payPeriod: DateRange,
): number => {
  const overlap = overlapDays(compensationRange, payPeriod);
  if (overlap <= 0) return 0;

  const periodDays = daysBetweenInclusive(payPeriod.start, payPeriod.end);
  if (periodDays <= 0) return 0;

  // Open-ended comp (no effective_to) covers the period entirely.
  if (compensationRange.openEnded) return monthlySalary;

  // BR-PAY-013 (docs/03_Specification/Payroll/SPEC.md): pro-rate = actual_days / period_days.
  // Ratio is always overlap / periodDays, so a comp that fully covers the pay
  // period (overlap == periodDays) always yields ratio 1, regardless of how
  // long the comp's own effective range is.
  const ratio = overlap / periodDays;
  return Math.round(monthlySalary * ratio);
};

export const effectiveCommissionPct = (
  commissionPct: number,
  compensationRange: DateRange,
  payPeriod: DateRange,
): { effectivePct: number; overlapDays: number; periodDays: number } => {
  const od = overlapDays(compensationRange, payPeriod);
  const pd = daysBetweenInclusive(payPeriod.start, payPeriod.end);

  if (pd <= 0 || od <= 0) {
    return { effectivePct: 0, overlapDays: od, periodDays: pd };
  }

  return {
    effectivePct: commissionPct,
    overlapDays: od,
    periodDays: pd,
  };
};
