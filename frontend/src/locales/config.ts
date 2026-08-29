/**
 * Supported locales.
 * `code` follows BCP 47 (used by Intl APIs).
 * `short` is used in the locale switcher UI.
 */
export interface LocaleDef {
  code: string;
  short: string;
  label: string;
  /** Native script label (auto-displayed in language picker). */
  native: string;
  /** Direction — only 'ltr' for now, 'rtl' reserved for future Arabic / Hebrew. */
  dir: 'ltr' | 'rtl';
}

export const LOCALES: LocaleDef[] = [
  { code: 'vi', short: 'VI', label: 'Vietnamese', native: 'Tiếng Việt', dir: 'ltr' },
  { code: 'en', short: 'EN', label: 'English', native: 'English', dir: 'ltr' },
];

export const DEFAULT_LOCALE = 'vi';

/** Type-safe helper: cast strings to TranslationKey where supported. */
export type TranslationKey = string;

export function isSupportedLocale(code: string | null | undefined): code is string {
  if (!code) return false;
  return LOCALES.some((l) => l.code === code);
}
