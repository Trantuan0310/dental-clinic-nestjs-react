import {
  daysBetweenInclusive,
  intersectRange,
  compRange,
  proRateBaseSalary,
  effectiveCommissionPct,
  proRateBaseSalaryParts,
  compensationOn,
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

  it('pro-rates an open-ended comp that starts mid-period (A1-08)', () => {
    // From Aug 25, no end: Aug 25-31 = 7 of 31 days.
    const comp = compRange(new Date('2026-08-25'), null);
    expect(proRateBaseSalary(31_000_000, comp, payPeriod)).toBe(7_000_000);
  });

  it('pro-rates when comp starts mid-month', () => {
    // Comp: 15tr from Aug 16 → Dec 31, pay period: Aug 1-31 (31 days)
    // overlap: Aug 16-31 = 16 days
    // BR-PAY-013 (SPEC.md): ratio = overlapDays / periodDays = 16/31
    const comp = compRange(new Date('2026-08-16'), new Date('2026-12-31'));
    const result = proRateBaseSalary(15_000_000, comp, payPeriod);
    // 15_000_000 × 16/31 ≈ 7,741,935
    expect(result).toBe(7_741_935);
  });

  it('pro-rates correctly when comp changes mid-month (BR-PAY-013)', () => {
    // Comp A: 15tr Aug 1-15 (15 days)
    // Comp B: 18tr Aug 16-31 (16 days)
    // Total pay period: 31 days
    // ratio = overlap / periodDays = 15/31 = 0.4839
    const compA = compRange(new Date('2026-08-01'), new Date('2026-08-15'));
    const payA = proRateBaseSalary(15_000_000, compA, payPeriod);
    expect(payA).toBe(7_258_065); // 15_000_000 * 15/31 rounded
  });
});

describe('proRateBaseSalaryParts (A6-04, A2-15)', () => {
  const payPeriod = { start: new Date('2026-09-01'), end: new Date('2026-09-30') };
  const term = (id: string, salary: number, from: string, to: string | null) => ({
    id,
    monthlySalary: salary,
    commissionPct: 0,
    overtimeHourlyVnd: 0,
    effectiveFrom: new Date(from),
    effectiveTo: to ? new Date(to) : null,
  });

  it('adds every comp overlapping the period, each by its own days', () => {
    const r = proRateBaseSalaryParts(
      [
        term('a', 30_000_000, '2026-01-01', '2026-09-15'),
        term('b', 60_000_000, '2026-09-16', null),
      ],
      payPeriod,
    );
    // 15 days × 1tr + 15 days × 2tr
    expect(r.parts.map(p => p.amount)).toEqual([15_000_000, 30_000_000]);
    expect(r.total).toBe(45_000_000);
  });

  it('a newcomer from the 25th is paid 6 of 30 days', () => {
    const r = proRateBaseSalaryParts([term('a', 30_000_000, '2026-09-25', null)], payPeriod);
    expect(r.total).toBe(6_000_000);
  });

  it('stops at the termination date (inclusive)', () => {
    const r = proRateBaseSalaryParts(
      [term('a', 30_000_000, '2026-01-01', null)],
      payPeriod,
      new Date('2026-09-20'),
    );
    expect(r.total).toBe(20_000_000);
  });

  it('pays nothing when terminated before the period', () => {
    const r = proRateBaseSalaryParts(
      [term('a', 30_000_000, '2026-01-01', null)],
      payPeriod,
      new Date('2026-08-31'),
    );
    expect(r.total).toBe(0);
  });

  it('WEEKLY: a week pays 7 days of the month, not a whole month', () => {
    const week = { start: new Date('2026-09-07'), end: new Date('2026-09-13') };
    const r = proRateBaseSalaryParts([term('a', 30_000_000, '2026-01-01', null)], week);
    expect(r.total).toBe(7_000_000);
  });

  it('WEEKLY/BIWEEKLY pieces of a month add up to exactly one monthly salary (rounding included)', () => {
    // August 2026 has 31 days; 10,000,000 / 31 is not a whole number.
    const pieces = [
      ['2026-08-01', '2026-08-02'],
      ['2026-08-03', '2026-08-09'],
      ['2026-08-10', '2026-08-16'],
      ['2026-08-17', '2026-08-23'],
      ['2026-08-24', '2026-08-30'],
      ['2026-08-31', '2026-08-31'],
    ];
    const terms = [term('a', 10_000_000, '2026-01-01', null)];
    const sum = pieces
      .map(
        ([s, e]) => proRateBaseSalaryParts(terms, { start: new Date(s), end: new Date(e) }).total,
      )
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(10_000_000);
    const halves = [
      ['2026-08-01', '2026-08-15'],
      ['2026-08-16', '2026-08-31'],
    ]
      .map(
        ([s, e]) => proRateBaseSalaryParts(terms, { start: new Date(s), end: new Date(e) }).total,
      )
      .reduce((a, b) => a + b, 0);
    expect(halves).toBe(10_000_000);
  });

  it('a week across two months takes each day at its own month rate', () => {
    // Aug 31 (1/31 of August) + Sep 1-6 (6/30 of September)
    const r = proRateBaseSalaryParts([term('a', 31_000_000, '2026-01-01', null)], {
      start: new Date('2026-08-31'),
      end: new Date('2026-09-06'),
    });
    expect(r.total).toBe(1_000_000 + 6_200_000);
  });

  it('a full month pays exactly the monthly salary', () => {
    const r = proRateBaseSalaryParts([term('a', 10_000_000, '2026-01-01', null)], {
      start: new Date('2026-02-01'),
      end: new Date('2026-02-28'),
    });
    expect(r.total).toBe(10_000_000);
  });

  it('compensationOn picks the comp in force that day', () => {
    const terms = [term('a', 1, '2026-01-01', '2026-09-15'), term('b', 2, '2026-09-16', null)];
    expect(compensationOn(terms, '2026-09-15')?.id).toBe('a');
    expect(compensationOn(terms, '2026-09-16')?.id).toBe('b');
    expect(compensationOn(terms, '2025-12-31')).toBeNull();
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
