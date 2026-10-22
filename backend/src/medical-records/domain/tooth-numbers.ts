/**
 * FDI two-digit tooth notation.
 *   - Permanent teeth: quadrants 1–4, positions 1–8 (11–18 … 41–48).
 *   - Primary teeth:   quadrants 5–8, positions 1–5 (51–55 … 81–85).
 * Anything else (19, 50, 56, 90…) is not a real tooth.
 */
export function isValidFdiToothNumber(n: unknown): boolean {
  if (typeof n !== 'number' || !Number.isInteger(n)) return false;
  const quadrant = Math.floor(n / 10);
  const position = n % 10;
  if (quadrant >= 1 && quadrant <= 4) return position >= 1 && position <= 8;
  if (quadrant >= 5 && quadrant <= 8) return position >= 1 && position <= 5;
  return false;
}

export const FDI_TOOTH_NUMBERS: readonly number[] = Array.from({ length: 90 }, (_, i) => i).filter(
  isValidFdiToothNumber,
);

/**
 * BR-MR-008: the tooth states a chart may record — the ones the chart screen
 * offers (frontend/src/types/medical-records.ts TOOTH_STATUSES).
 */
export const TOOTH_STATUSES = [
  'healthy',
  'cavity',
  'filled',
  'crowned',
  'missing',
  'implant',
  'extraction_needed',
] as const;

export const TOOTH_NOTE_MAX = 1000;

/** Teeth whose entry is not `{ status: <one of TOOTH_STATUSES>, notes?: string ≤ 1000 }`. */
export function invalidToothEntries(teeth: Record<string, unknown>): string[] {
  return Object.entries(teeth ?? {})
    .filter(([, v]) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
      const { status, notes } = v as { status?: unknown; notes?: unknown };
      if (typeof status !== 'string' || !(TOOTH_STATUSES as readonly string[]).includes(status)) {
        return true;
      }
      return (
        notes !== undefined &&
        notes !== null &&
        (typeof notes !== 'string' || notes.length > TOOTH_NOTE_MAX)
      );
    })
    .map(([k]) => k);
}
