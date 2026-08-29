import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { LOCALES, DEFAULT_LOCALE } from './config';
import vi from './vi.json';
import en from './en.json';

/**
 * Initialize i18next once at app boot.
 *
 * Detection order (browser language detector):
 *   1. localStorage `gensmile.i18n` (user override)
 *   2. <html lang="..."> attribute (set by server)
 *   3. navigator.language
 *
 * Persistence: cached in localStorage so explicit user choice survives reloads.
 *
 * Note: we deliberately skip the `escapeValue` JSON formatter flag — react-i18next
 * handles XSS escaping of {{interpolation}} values automatically.
 */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'htmlTag', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'gensmile.i18n',
    },
    returnEmptyString: false,
  });

// Keep <html lang="..."> attribute in sync with current locale — this is what
// assistive technologies, browser translation prompts, and our inline
// pre-React theme script rely on.
function syncHtmlLang(lng: string | undefined) {
  if (typeof document === 'undefined') return;
  const code = lng?.split('-')[0] ?? DEFAULT_LOCALE;
  const supported = LOCALES.find((l) => l.code === code);
  document.documentElement.lang = supported?.code ?? DEFAULT_LOCALE;
  document.documentElement.dir = supported?.dir ?? 'ltr';
}

syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export { i18n };
export { LOCALES, DEFAULT_LOCALE } from './config';
