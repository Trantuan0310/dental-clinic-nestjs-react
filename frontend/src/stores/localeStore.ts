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

function readCurrent(): string {
  if (typeof document !== 'undefined') {
    const html = document.documentElement.lang;
    if (html) return html;
  }
  return i18n.language || LOCALES[0].code;
}

export const useLocaleStore = create<LocaleState>((set) => {
  // Sync to current i18n state on init.
  i18n.on('languageChanged', (lng) => set({ locale: lng }));
  return {
    locale: readCurrent(),
    setLocale: (code) => {
      if (!LOCALES.some((l) => l.code === code)) return;
      void i18n.changeLanguage(code);
      // localStorage write is handled by i18next-browser-languagedetector.
      set({ locale: code });
    },
  };
});
