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
