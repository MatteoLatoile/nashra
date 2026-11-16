export const LANGUAGES = [
  { code: 'fr', native: 'Français', english: 'French', direction: 'ltr' },
  { code: 'en', native: 'English', english: 'English', direction: 'ltr' },
  { code: 'ar', native: 'العربية', english: 'Arabic', direction: 'rtl' },
  { code: 'ru', native: 'Русский', english: 'Russian', direction: 'ltr' },
  { code: 'es', native: 'Español', english: 'Spanish', direction: 'ltr' },
  { code: 'it', native: 'Italiano', english: 'Italian', direction: 'ltr' },
  { code: 'de', native: 'Deutsch', english: 'German', direction: 'ltr' },
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', direction: 'ltr' },
  { code: 'fil', native: 'Filipino', english: 'Filipino', direction: 'ltr' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', direction: 'ltr' },
  { code: 'ur', native: 'اردو', english: 'Urdu', direction: 'rtl' },
] as const;

export type Locale = typeof LANGUAGES[number]['code'];
export type LanguageChoice = Locale | 'auto';
export const isLocale = (value: unknown): value is Locale =>
  LANGUAGES.some((item) => item.code === value);
export const isChoice = (value: unknown): value is LanguageChoice =>
  value === 'auto' || isLocale(value);

export function detectDeviceLanguage(): Locale {
  if (typeof navigator === 'undefined') return 'fr';
  const requests = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const requested of requests) {
    const canonical = String(requested || '').toLowerCase().replaceAll('_', '-').split('-')[0];
    const choice = canonical === 'tl' ? 'fil' : canonical === 'in' ? 'id' : canonical;
    if (isLocale(choice)) return choice;
  }
  return 'en';
}

type Catalog = Record<string, Partial<Record<Exclude<Locale, 'fr'>, string>>>;
let translations: Catalog | null = null;
let loadingCatalog: Promise<void> | null = null;

/** The sizeable catalog is optional for French users and should not be in the initial bundle. */
export function hasTranslationCatalog(): boolean { return translations !== null; }

export function loadTranslationCatalog(): Promise<void> {
  if (translations) return Promise.resolve();
  if (!loadingCatalog) {
    loadingCatalog = import('./catalog.json')
      .then(module => { translations = module.default as Catalog; })
      .catch(error => { loadingCatalog = null; throw error; });
  }
  return loadingCatalog;
}
export function translateFrench(source: string, locale: Locale): string | undefined {
  if (locale === 'fr') return source;
  const entry = translations?.[source];
  return entry?.[locale] || entry?.en;
}

export function localeForIntl(locale: Locale): string {
  return ({ fr: 'fr-FR', en: 'en-US', ar: 'ar-SA', ru: 'ru-RU', es: 'es-ES',
    it: 'it-IT', de: 'de-DE', id: 'id-ID', fil: 'fil-PH', tr: 'tr-TR', ur: 'ur-PK' })[locale];
}
