import { create } from 'zustand';
import { i18n, LOCALES } from '@/locales';

/**
 * Thin Zustand wrapper around i18next to expose the current locale to React.
 * Subscribers re-render on `languageChanged` events emitted by i18next.
 *
 * Why not just use i18next directly with useTranslation?
 *   - useTranslation hooks re-render on every key change which is overkill
 *     for the small switcher component.
 *   - We want a single source of truth that the language switcher can read
 *     from without depending on a translator hook.
 */

interface LocaleState {
  locale: string;
  setLocale: (code: string) => void;
}

function normalizeLocale(language: string | undefined): string {
  const code = language?.split('-')[0];
  return LOCALES.find((locale) => locale.code === code)?.code || LOCALES[0].code;
}

function readCurrent(): string {
  return normalizeLocale(i18n.resolvedLanguage || i18n.language);
}

export const useLocaleStore = create<LocaleState>((set) => {
  // Sync to current i18n state on init.
  i18n.on('languageChanged', (lng) => set({ locale: normalizeLocale(lng) }));
  return {
    locale: readCurrent(),
    setLocale: (code) => {
      if (!LOCALES.some((l) => l.code === code)) return;
      // The languageChanged event updates this store only after i18next has
      // completed the change, keeping subscribers aligned with rendered text.
      void i18n.changeLanguage(code);
    },
  };
});
