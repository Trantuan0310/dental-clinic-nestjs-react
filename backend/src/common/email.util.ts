import { Transform } from 'class-transformer';

/**
 * Login emails are case-insensitive: stored and compared in lowercase
 * (migration 037 enforces uniqueness on lower(email)).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Active-account lookup by login email: exact (lowercase) match first, then a
 * case-insensitive one for rows migration 037 had to leave in mixed case.
 * The fallback only counts when exactly one account matches; several means
 * "not found", so a login never picks one of two look-alike accounts.
 */
export async function findActiveUserByEmail<T extends { email: string }>(
  email: string,
  findOne: (where: ActiveEmailWhere<string>) => Promise<T | null>,
  findMany: (where: ActiveEmailWhere<{ equals: string; mode: 'insensitive' }>) => Promise<T[]>,
): Promise<T | null> {
  const normalized = normalizeEmail(email);
  const base = { deactivatedAt: null, deletedAt: null } as const;
  const exact = await findOne({ ...base, email: normalized });
  if (exact) return exact;
  // Filter again in JS: only true case-insensitive matches count.
  const loose = (
    (await findMany({ ...base, email: { equals: normalized, mode: 'insensitive' } })) ?? []
  ).filter(u => normalizeEmail(u.email) === normalized);
  return loose.length === 1 ? loose[0] : null;
}

type ActiveEmailWhere<E> = { email: E; deactivatedAt: null; deletedAt: null };

/** DTO decorator: trim + lowercase a login email before validation. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value));
}
