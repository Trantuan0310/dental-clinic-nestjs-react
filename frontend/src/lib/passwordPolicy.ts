/** Mirrors backend/src/auth/password-policy.ts and AuthService.validatePasswordStrength. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The i18n key of the first broken rule, or null. Email is optional (unknown on the reset page). */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return 'uiEntry.account.passwordLength';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'uiEntry.account.passwordLettersNumbers';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'uiEntry.account.passwordEmail';
  return null;
}
