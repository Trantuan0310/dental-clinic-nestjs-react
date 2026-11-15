import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { LOCALES, DEFAULT_LOCALE } from './config';
import vi from './vi.json';
import { vi as uiVisitTemplates } from './uiVisitTemplates';
import { vi as uiCommon } from './uiCommon';
import { vi as uiClinical } from './uiClinical';
import { vi as uiEntry } from './uiEntry';
import { vi as uiOperations } from './uiOperations';
import { vi as uiScheduling } from './uiScheduling';
import { vi as uiWorkforce } from './uiWorkforce';
import { vi as uiPlans } from './uiPlans';
import { vi as uiRecalls } from './uiRecalls';
import { vi as uiNotifications } from './uiNotifications';
import { vi as uiMessaging } from './uiMessaging';
import { vi as uiAi } from './uiAi';

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
      vi: { translation: { ...vi, uiAi, uiClinical, uiCommon, uiEntry, uiMessaging, uiNotifications, uiOperations, uiPlans, uiRecalls, uiScheduling, uiVisitTemplates, uiWorkforce } },
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
    // English is added on demand (loadLocale), Vietnamese ships with the app.
    partialBundledLanguages: true,
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

/** Fetch a non-default language's strings once; Vietnamese is always present. */
export async function loadLocale(lng: string | undefined): Promise<void> {
  const code = lng?.split('-')[0];
  if (code !== 'en' || i18n.hasResourceBundle('en', 'translation')) return;
  const { translation } = await import('./en/index');
  i18n.addResourceBundle('en', 'translation', translation, true, true);
}

// A saved English choice: load it, then re-render in English.
if (i18n.language?.startsWith('en')) {
  void loadLocale(i18n.language).then(() => i18n.changeLanguage(i18n.language));
}

syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export { i18n };
export { LOCALES, DEFAULT_LOCALE } from './config';
