import { computeProgressiveTax, DEFAULT_TAX_BRACKETS } from './tax-calculator';

describe('computeProgressiveTax', () => {
  it('returns 0 tax when gross equals personal deduction', () => {
    const result = computeProgressiveTax(11_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(0);
    expect(result.totalTaxVnd).toBe(0);
    expect(result.brackets).toHaveLength(0);
  });

  it('returns 0 tax when gross below personal deduction', () => {
    const result = computeProgressiveTax(8_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(0);
    expect(result.totalTaxVnd).toBe(0);
  });

  it('applies 5% to first bracket only', () => {
    // Gross = 13tr → taxable = 2tr → all in bracket 1 (≤5tr, 5%)
    const result = computeProgressiveTax(13_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(2_000_000);
    expect(result.brackets).toHaveLength(1);
    expect(result.brackets[0].rate).toBe(0.05);
    expect(result.brackets[0].appliedVnd).toBe(2_000_000);
    expect(result.totalTaxVnd).toBe(100_000);
  });

  it('applies first 2 brackets', () => {
    // Gross = 16tr → taxable = 5tr → fills first bracket exactly (5tr × 5%)
    const result = computeProgressiveTax(16_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(5_000_000);
    expect(result.brackets).toHaveLength(1);
    expect(result.totalTaxVnd).toBe(250_000);
  });

  it('applies first 3 brackets (BR-PAY-009 spec example)', () => {
    // Gross = 30tr → taxable = 19tr → 5tr @5% + 5tr @10% + 8tr @15% + 1tr @20%
    // Tax = 250k + 500k + 1.2tr + 200k = 2.15tr
    const result = computeProgressiveTax(30_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(19_000_000);
    expect(result.brackets).toHaveLength(4);
    expect(result.totalTaxVnd).toBe(2_150_000);

    const [b1, b2, b3, b4] = result.brackets;
    expect(b1.appliedVnd).toBe(5_000_000);
    expect(b1.taxVnd).toBe(250_000);
    expect(b2.appliedVnd).toBe(5_000_000);
    expect(b2.taxVnd).toBe(500_000);
    expect(b3.appliedVnd).toBe(8_000_000);
    expect(b3.taxVnd).toBe(1_200_000);
    expect(b4.appliedVnd).toBe(1_000_000);
    expect(b4.taxVnd).toBe(200_000);
  });

  it('applies top bracket for very high income', () => {
    // Gross = 100tr → taxable = 89tr → fills all 7 brackets
    // 5tr @5% + 5tr @10% + 8tr @15% + 14tr @20% + 20tr @25% + 28tr @30% + 9tr @35%
    // = 250k + 500k + 1.2tr + 2.8tr + 5tr + 8.4tr + 3.15tr = 21.30tr
    const result = computeProgressiveTax(100_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(89_000_000);
    expect(result.brackets).toHaveLength(7);
    expect(result.totalTaxVnd).toBe(21_300_000);
  });

  it('handles edge case: gross exactly equal to last bracket lower bound', () => {
    // 43tr gross → 32tr taxable → exactly fills first 4 brackets
    const result = computeProgressiveTax(43_000_000, DEFAULT_TAX_BRACKETS);
    expect(result.taxableIncomeVnd).toBe(32_000_000);
    expect(result.brackets).toHaveLength(4);
    // 250k + 500k + 1.2tr + 2.8tr = 4.75tr
    expect(result.totalTaxVnd).toBe(4_750_000);
  });

  it('throws for negative gross', () => {
    expect(() => computeProgressiveTax(-1, DEFAULT_TAX_BRACKETS)).toThrow(
      'grossVnd must be non-negative',
    );
  });

  it('rounds to integer VND', () => {
    const result = computeProgressiveTax(11_500_000, DEFAULT_TAX_BRACKETS);
    // taxable = 500k → 5% × 500k = 25k (exact)
    expect(result.totalTaxVnd).toBe(25_000);
    expect(Number.isInteger(result.totalTaxVnd)).toBe(true);
  });

  it('uses configurable personal deduction', () => {
    const config = { ...DEFAULT_TAX_BRACKETS, personalDeductionVnd: 5_000_000 };
    const result = computeProgressiveTax(10_000_000, config);
    expect(result.taxableIncomeVnd).toBe(5_000_000);
    expect(result.totalTaxVnd).toBe(250_000);
  });
});
