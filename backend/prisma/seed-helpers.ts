/**
 * Reusable pure functions for the seed scripts.
 * No side effects, no DB access — only deterministic helpers
 * (the shared `rand()` integer PRNG is still defined in seed-clinical.ts
 * for backwards compatibility).
 */

// ----- Time / date helpers -----------------------------------------------

/**
 * Build a Date at the given day-of-month, hour, minute (UTC).
 * Signature accepts up to 6 args — seconds default to 0.
 */
export function utcDate(year: number, monthIdx: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, monthIdx, day, hour, minute, second, 0));
}

/** Add minutes to a date (UTC-safe). */
export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Add days to a date (UTC, midnight). */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Random Date in [start, end]. Uses shared `rand()` PRNG. */
export function randomDateInRange(getRand: () => number, start: Date, end: Date): Date {
  const ms = start.getTime() + (end.getTime() - start.getTime()) * getRand();
  return new Date(ms);
}

// ----- Random helpers (work with the shared PRNG) -----------------------

export function randInt(getRand: () => number, min: number, max: number): number {
  return Math.floor(getRand() * (max - min + 1)) + min;
}

export function pick<T>(getRand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(getRand() * arr.length)];
}

/**
 * Weighted pick: items[i] chosen with probability weights[i]/sum(weights).
 * Weights need not be normalised.
 */
export function pickWeighted<T>(getRand: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = getRand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ----- Money helpers (VND = no decimals, round to 1000) -----------------

/** Round VND amount to nearest 1 000 ₫ (cents-free convention). */
export function roundToThousand(n: number): number {
  return Math.round(n / 1000) * 1000;
}

// ----- Sequence helpers ---------------------------------------------------

/**
 * Zero-pad an integer into the `PAT-YYYY-NNNNN` or `INV-YYYY-NNNNNN` form.
 */
export function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

// ----- Operating days (Mon-Fri) -----------------------------------------

/**
 * Returns array of business dates (Mon-Fri) between start and end (inclusive).
 * Backdate-aware: every date returned is a JS Date with UTC midnight.
 */
export function getOperatingDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur.getTime() <= last.getTime()) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cur.getTime()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
