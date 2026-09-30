import { Transform } from 'class-transformer';

/**
 * Login emails are case-insensitive: stored and compared in lowercase
 * (migration 037 enforces uniqueness on lower(email)).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Active-account lookup by login email. Migration 037 leaves look-alike rows
 * (User@x / user@x) in place when it cannot add the lower(email) index, so
 * every case-insensitive match is counted: exactly one account is returned,
 * several mean "not found", so a login never picks one of two look-alikes.
 */
export async function findActiveUserByEmail<T extends { email: string }>(
  email: string,
  findOne: (where: ActiveEmailWhere<string>) => Promise<T | null>,
  findMany: (where: ActiveEmailWhere<{ equals: string; mode: 'insensitive' }>) => Promise<T[]>,
): Promise<T | null> {
  const normalized = normalizeEmail(email);
  const base = { deactivatedAt: null, deletedAt: null } as const;
  const exact = await findOne({ ...base, email: normalized });
  // Filter again in JS: only true case-insensitive matches count.
  const loose = (
    (await findMany({ ...base, email: { equals: normalized, mode: 'insensitive' } })) ?? []
  ).filter(u => normalizeEmail(u.email) === normalized);
  if (loose.length > 1) return null;
  return exact ?? loose[0] ?? null;
}

type ActiveEmailWhere<E> = { email: E; deactivatedAt: null; deletedAt: null };

/** DTO decorator: trim + lowercase a login email before validation. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value));
}
