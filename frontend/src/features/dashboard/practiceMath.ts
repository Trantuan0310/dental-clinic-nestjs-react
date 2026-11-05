import type { ScorecardMetric } from './types';

// Pure helpers for the practice cards, kept apart so the components file only exports components.

export type Verdict = 'good' | 'ok' | 'poor';

export function verdictOf(m: Pick<ScorecardMetric, 'value' | 'direction' | 'target' | 'okAt'>): Verdict | null {
  if (m.value == null) return null;
  if (m.direction === 'lower') return m.value <= m.target ? 'good' : m.value <= m.okAt ? 'ok' : 'poor';
  return m.value >= m.target ? 'good' : m.value >= m.okAt ? 'ok' : 'poor';
}

/** Where the scale ends: 100 for a percentage, else room past "acceptable" and past the value. */
export function scaleMax(m: Pick<ScorecardMetric, 'value' | 'unit' | 'okAt'>): number {
  if (m.unit === 'percent') return 100;
  return Math.max(m.okAt * 1.5, (m.value ?? 0) * 1.1);
}

/** Light-to-teal ramp by utilisation; the text flips to white once the cell is dark. */
export function cellStyle(utilization: number): { backgroundColor: string; dark: boolean } {
  const u = Math.max(0, Math.min(1, utilization));
  return { backgroundColor: `rgba(27, 122, 120, ${(0.07 + u * 0.88).toFixed(3)})`, dark: u >= 0.55 };
}

/** "3 of 4 came" as a whole percent; null when there was nothing to start from. */
export function stepPercent(count: number, before: number): number | null {
  return before > 0 ? Math.round((count / before) * 100) : null;
}
