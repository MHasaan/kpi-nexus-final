/**
 * i18n dictionaries (PoC scope per P9). en-US is the source/fallback; ur-PK is
 * RTL. Full string extraction is incremental — only a starter set of keys is
 * translated to prove the pipeline + RTL flip.
 */
export const LOCALES = ['en-US', 'es', 'fr', 'ur-PK'] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['ur-PK'];

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English (US)',
  es: 'Español',
  fr: 'Français',
  'ur-PK': 'اردو (پاکستان)',
};

type Dict = Record<string, string>;

const en: Dict = {
  'profile.title': 'Profile',
  'profile.language': 'Language',
  'profile.languageHint': 'Changes the interface language on this device.',
  'nav.dashboard': 'Dashboard',
  'nav.kpis': 'KPIs',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'search.placeholder': 'Search KPIs, dashboards, people…',
};

const ur: Dict = {
  'profile.title': 'پروفائل',
  'profile.language': 'زبان',
  'profile.languageHint': 'اس ڈیوائس پر انٹرفیس کی زبان تبدیل کرتا ہے۔',
  'nav.dashboard': 'ڈیش بورڈ',
  'nav.kpis': 'کے پی آئیز',
  'common.save': 'محفوظ کریں',
  'common.cancel': 'منسوخ کریں',
  'search.placeholder': 'کے پی آئی، ڈیش بورڈ، لوگ تلاش کریں…',
};

// es/fr fall back to en for now (incremental translation).
export const DICTIONARIES: Record<Locale, Dict> = {
  'en-US': en,
  es: en,
  fr: en,
  'ur-PK': ur,
};

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** The share of the English strings a language has words of its own for (0 when it falls back to English). */
export function translationCoverage(locale: Locale): number {
  if (locale === 'en-US') return 1;
  const dict = DICTIONARIES[locale];
  if (dict === en) return 0;
  const keys = Object.keys(en);
  const own = keys.filter((k) => dict[k] !== undefined && dict[k] !== en[k]).length;
  return keys.length === 0 ? 0 : own / keys.length;
}

/**
 * The languages a person is offered: those with translations of their own. A language the app knows but has
 * not translated yet stays out of the picker until it is ready (F-065: Spanish and French were offered and
 * translated nothing, so the product looked localised when it was not).
 */
export const OFFERED_LOCALES: readonly Locale[] = LOCALES.filter((l) => translationCoverage(l) > 0);
