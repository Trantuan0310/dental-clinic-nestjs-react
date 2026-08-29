import {
  daysBetweenInclusive,
  intersectRange,
  compRange,
  proRateBaseSalary,
  effectiveCommissionPct,
} from './prorate-calculator';

describe('daysBetweenInclusive', () => {
  it('counts both endpoints', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-31');
    expect(daysBetweenInclusive(start, end)).toBe(31);
  });

  it('returns 1 for same day', () => {
    const d = new Date('2026-08-15');
    expect(daysBetweenInclusive(d, d)).toBe(1);
  });
});

describe('intersectRange', () => {
  it('returns overlap when ranges intersect', () => {
    const a = { start: new Date('2026-08-01'), end: new Date('2026-08-15') };
    const b = { start: new Date('2026-08-10'), end: new Date('2026-08-31') };
    const result = intersectRange(a, b);
    expect(result).toEqual({
      start: new Date('2026-08-10'),
      end: new Date('2026-08-15'),
    });
  });

  it('returns null when ranges do not intersect', () => {
    const a = { start: new Date('2026-08-01'), end: new Date('2026-08-10') };
    const b = { start: new Date('2026-08-15'), end: new Date('2026-08-31') };
    expect(intersectRange(a, b)).toBeNull();
  });

  it('returns full range when one contains the other', () => {
    const a = { start: new Date('2026-08-01'), end: new Date('2026-08-31') };
    const b = { start: new Date('2026-08-10'), end: new Date('2026-08-15') };
    expect(intersectRange(a, b)).toEqual(b);
  });
});

describe('proRateBaseSalary', () => {
  const payPeriod = { start: new Date('2026-08-01'), end: new Date('2026-08-31') };

  it('returns 0 when comp range is before pay period', () => {
    const comp = compRange(new Date('2026-07-01'), new Date('2026-07-31'));
    expect(proRateBaseSalary(15_000_000, comp, payPeriod)).toBe(0);
  });

  it('returns 0 when comp range is after pay period', () => {
    const comp = compRange(new Date('2026-09-01'), new Date('2026-09-30'));
    expect(proRateBaseSalary(15_000_000, comp, payPeriod)).toBe(0);
  });

  it('returns full amount when comp covers entire pay period', () => {
    const comp = compRange(new Date('2026-08-01'), new Date('2026-08-31'));
    expect(proRateBaseSalary(15_000_000, comp, payPeriod)).toBe(15_000_000);
  });

  it('returns full amount when comp extends beyond pay period (open-ended)', () => {
    const comp = compRange(new Date('2026-01-01'), null);
    expect(proRateBaseSalary(15_000_000, comp, payPeriod)).toBe(15_000_000);
  });

  it('pro-rates when comp starts mid-month', () => {
    // Comp: 15tr from Aug 16 → Dec 31 (138 days), pay period: Aug 1-31 (31 days)
    // overlap: Aug 16-31 = 16 days
    // BR-PAY-013: ratio = overlapDays / max(compDays, periodDays) = 16/138
    const comp = compRange(new Date('2026-08-16'), new Date('2026-12-31'));
    const result = proRateBaseSalary(15_000_000, comp, payPeriod);
    // 15_000_000 × 16/138 ≈ 1,739,130
    expect(result).toBe(1_739_130);
  });

  it('pro-rates correctly when comp changes mid-month (BR-PAY-013)', () => {
    // Comp A: 15tr Aug 1-15 (15 days)
    // Comp B: 18tr Aug 16-31 (16 days)
    // Total pay period: 31 days
    // Pay A: 15tr × 15/138 = 1,630,434 (using BR-PAY-013 max formula)
    // Actually with compDays=15: 15tr × 15/31 = 7,258,064
    const compA = compRange(new Date('2026-08-01'), new Date('2026-08-15'));
    const payA = proRateBaseSalary(15_000_000, compA, payPeriod);
    // ratio = 15 / max(15, 31) = 15/31 = 0.4839
    expect(payA).toBe(7_258_065); // 15_000_000 * 15/31 rounded
  });
});

describe('effectiveCommissionPct', () => {
  const payPeriod = { start: new Date('2026-08-01'), end: new Date('2026-08-31') };

  it('returns 0 when no overlap', () => {
    const comp = compRange(new Date('2026-07-01'), new Date('2026-07-31'));
    const result = effectiveCommissionPct(0.3, comp, payPeriod);
    expect(result.effectivePct).toBe(0);
    expect(result.overlapDays).toBe(0);
  });

  it('returns full pct when comp covers full period', () => {
    const comp = compRange(new Date('2026-01-01'), null);
    const result = effectiveCommissionPct(0.3, comp, payPeriod);
    expect(result.effectivePct).toBe(0.3);
    expect(result.overlapDays).toBe(31);
    expect(result.periodDays).toBe(31);
  });

  it('returns partial overlap days when comp is mid-month', () => {
    const comp = compRange(new Date('2026-08-16'), new Date('2026-12-31'));
    const result = effectiveCommissionPct(0.3, comp, payPeriod);
    expect(result.effectivePct).toBe(0.3);
    expect(result.overlapDays).toBe(16);
  });
});
