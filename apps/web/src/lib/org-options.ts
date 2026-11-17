/**
 * The choices offered for an organisation's own settings — size, time zone,
 * currency, language, fiscal year, week — in one place, so the setup wizard
 * and the settings pages offer the same things under the same names.
 */

export interface Option<V extends string | number = string> {
  value: V;
  label: string;
}

export const SIZE_TIER_OPTIONS: ReadonlyArray<Option> = [
  { value: 'SMALL', label: 'Small — up to 50 people' },
  { value: 'MEDIUM', label: 'Medium — 51 to 250' },
  { value: 'LARGE', label: 'Large — 251 to 1,000' },
  { value: 'ENTERPRISE', label: 'Enterprise — over 1,000' },
];

export const MONTH_OPTIONS: ReadonlyArray<Option<number>> = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ value: index + 1, label }));

/** 0 = Sunday … 6 = Saturday, as stored. The three days a working week starts on. */
export const WEEK_START_OPTIONS: ReadonlyArray<Option<number>> = [
  { value: 1, label: 'Monday' },
  { value: 0, label: 'Sunday' },
  { value: 6, label: 'Saturday' },
];

export const LOCALE_OPTIONS: ReadonlyArray<Option> = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-PK', label: 'English (Pakistan)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'ur-PK', label: 'Urdu (Pakistan)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'ar-AE', label: 'Arabic (United Arab Emirates)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'tr-TR', label: 'Turkish (Türkiye)' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ja-JP', label: 'Japanese (Japan)' },
];

const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'PKR',
  'INR',
  'AED',
  'SAR',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'CHF',
  'SGD',
  'TRY',
  'BRL',
  'ZAR',
  'NGN',
  'EGP',
  'BDT',
  'MYR',
];

const FALLBACK_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];

type Supported = (key: 'timeZone' | 'currency') => string[];

function supported(key: 'timeZone' | 'currency'): string[] | null {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: Supported }).supportedValuesOf;
    const values = fn?.(key);
    return values && values.length > 0 ? values : null;
  } catch {
    return null;
  }
}

/** A value that is set but not on the list is kept selectable, never silently dropped. */
function withCurrent<T extends Option>(options: T[], current: string | undefined, make: (value: string) => T): T[] {
  if (!current || options.some((o) => o.value === current)) return options;
  return [make(current), ...options];
}

/** Every time zone the browser knows (UTC first), or a short world list where it cannot say. */
export function timeZoneOptions(current?: string): Option[] {
  const zones = supported('timeZone') ?? FALLBACK_TIME_ZONES;
  const all = ['UTC', ...zones.filter((z) => z !== 'UTC')];
  return withCurrent(
    all.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
    current,
    (value) => ({ value, label: value.replace(/_/g, ' ') }),
  );
}

/** The time zone this browser is in, if it will say. */
export function browserTimeZone(): string | null {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "USD — US Dollar": the common currencies first, by name where the browser knows it. */
export function currencyOptions(current?: string, locale = 'en'): Option[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'currency' });
  } catch {
    names = null;
  }
  const label = (code: string): string => {
    let display: string | undefined;
    try {
      display = names?.of(code);
    } catch {
      display = undefined;
    }
    return display && display !== code ? `${code} — ${display}` : code;
  };
  return withCurrent(
    COMMON_CURRENCIES.map((value) => ({ value, label: label(value) })),
    current?.toUpperCase(),
    (value) => ({ value, label: label(value) }),
  );
}

/** Language options, keeping a current value that is not on the list. */
export function localeOptions(current?: string): Option[] {
  return withCurrent([...LOCALE_OPTIONS], current, (value) => ({ value, label: value }));
}
