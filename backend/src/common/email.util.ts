import { Transform } from 'class-transformer';

/**
 * Login emails are case-insensitive: stored and compared in lowercase
 * (migration 037 enforces uniqueness on lower(email)).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** DTO decorator: trim + lowercase a login email before validation. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value));
}
