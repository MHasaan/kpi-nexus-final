import { DICTIONARIES, type Locale } from './dictionaries';

/**
 * Pure translation lookup with en-US fallback then the key itself. Keeps the
 * resolution logic unit-testable independent of React.
 */
export function translate(locale: Locale, key: string): string {
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES['en-US'][key] ?? key;
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (value && value in DICTIONARIES) return value as Locale;
  return 'en-US';
}
