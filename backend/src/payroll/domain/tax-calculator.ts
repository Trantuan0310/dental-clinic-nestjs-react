export interface TaxBracket {
  min: number;
  max?: number;
  rate: number;
}

export interface StoredTaxBracket {
  thresholdVnd: number | null;
  rate: number;
}

export interface TaxBracketsConfig {
  brackets: TaxBracket[] | StoredTaxBracket[];
  personalDeductionVnd?: number;
}

export const DEFAULT_TAX_BRACKETS: TaxBracketsConfig = {
  // Vietnam PIT (Thuế TNCN) personal deduction — current statutory amount.
  personalDeductionVnd: 11_000_000,
  brackets: [
    { min: 0, max: 5000000, rate: 0.05 },
    { min: 5000000, max: 10000000, rate: 0.1 },
    { min: 10000000, max: 18000000, rate: 0.15 },
    { min: 18000000, max: 32000000, rate: 0.2 },
    { min: 32000000, max: 52000000, rate: 0.25 },
    { min: 52000000, max: 80000000, rate: 0.3 },
    { min: 80000000, rate: 0.35 },
  ],
};

export interface TaxComputationResult {
  totalTaxVnd: number;
  taxableIncomeVnd: number;
  brackets: Array<{
    bracket: TaxBracket;
    taxableInBracket: number;
    taxInBracket: number;
    rate: number;
    appliedVnd: number;
    taxVnd: number;
  }>;
}

export const computeProgressiveTax = (
  annualIncomeVnd: number,
  config: TaxBracketsConfig,
): TaxComputationResult => {
  if (!Number.isFinite(annualIncomeVnd) || annualIncomeVnd < 0) {
    throw new Error('grossVnd must be non-negative');
  }
  const rawBrackets = config.brackets || DEFAULT_TAX_BRACKETS.brackets;
  const personalDeduction = (config as { personalDeductionVnd?: number }).personalDeductionVnd ?? 0;
  const taxableIncome = Math.max(0, annualIncomeVnd - personalDeduction);
  let remainingIncome = taxableIncome;
  let totalTax = 0;
  const breakdown: TaxComputationResult['brackets'] = [];

  const normalize = (b: TaxBracket | StoredTaxBracket): TaxBracket => {
    if ('thresholdVnd' in b) {
      return { min: b.thresholdVnd ?? 0, rate: b.rate };
    }
    return b;
  };

  for (const raw of rawBrackets) {
    if (remainingIncome <= 0) break;
    const bracket = normalize(raw);

    const bracketMin = bracket.min;
    const bracketMax = bracket.max ?? Infinity;
    const bracketRange = bracketMax - bracketMin;
    const appliedInBracket = Math.min(remainingIncome, bracketRange);
    const taxInBracket = appliedInBracket * bracket.rate;

    totalTax += taxInBracket;
    remainingIncome -= appliedInBracket;

    breakdown.push({
      bracket,
      taxableInBracket: Math.round(appliedInBracket),
      taxInBracket: Math.round(taxInBracket),
      rate: bracket.rate,
      appliedVnd: Math.round(appliedInBracket),
      taxVnd: Math.round(taxInBracket),
    });
  }

  return {
    totalTaxVnd: Math.round(totalTax),
    taxableIncomeVnd: taxableIncome,
    brackets: breakdown,
  };
};
