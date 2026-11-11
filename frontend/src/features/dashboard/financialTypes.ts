import type { ScorecardMetric } from './types';

export type KpiThreshold = Pick<ScorecardMetric, 'key' | 'unit' | 'direction' | 'target' | 'okAt'>;
export interface FinancialWaterfall {
  from: string; to: string;
  basis: Record<string, string>;
  netRevenue: number; netCollected: number; remaining: number;
  steps: Array<{ key: string; amount: number; total?: boolean; from: number; to: number }>;
}
export interface DentistPanel {
  dentistId: string; dentistName: string; revenue: number; visits: number;
  proposed: number; accepted: number; acceptancePct: number | null;
}
export interface MonthlyAging {
  month: string; asOf: string; D0_30: number; D31_60: number; D61_90: number; D90_PLUS: number; total: number;
}
