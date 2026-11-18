/**
 * How an organisation writes dates and numbers. One set of rules for the web
 * app and the API (report files, emails), driven by the organisation's
 * settings: timezone, date format, number format, currency.
 */

import { isTimeZone } from './onboarding.js';

/** The date patterns an organisation can choose. */
export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'D MMM YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** The number styles an organisation can choose, each named by how it writes 1234.56. */
export const NUMBER_FORMATS = ['1,234.56', '1.234,56', '1 234,56', '1,23,456.78'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface FormatSettings {
  /** IANA timezone, e.g. "Asia/Karachi". Instants are shown in it. */
  timezone: string;
  /** BCP 47 locale; used for month names and the currency symbol. */
  locale: string;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  timezone: 'UTC',
  locale: 'en-US',
  currency: 'USD',
  dateFormat: 'YYYY-MM-DD',
  numberFormat: '1,234.56',
};

const SEPARATORS: Record<NumberFormat, { group: string; decimal: string; indian: boolean }> = {
  '1,234.56': { group: ',', decimal: '.', indian: false },
  '1.234,56': { group: '.', decimal: ',', indian: false },
  // A narrow no-break space, so a number never wraps in the middle.
  '1 234,56': { group: ' ', decimal: ',', indian: false },
  '1,23,456.78': { group: ',', decimal: '.', indian: true },
};

function usable<T>(probe: () => T): boolean {
  try {
    probe();
    return true;
  } catch {
    return false;
  }
}

const isTimezone = (value: unknown): value is string => typeof value === 'string' && isTimeZone(value);
/** Whether `value` is a usable BCP 47 locale. */
export const isLocale = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && usable(() => new Intl.NumberFormat(value));
/** Whether `value` is a usable ISO 4217 currency code. */
export const isCurrency = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) && usable(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: value }));

/**
 * The format settings of an organisation as stored. Anything missing or
 * unusable falls back to the default — a bad value in a setting must not break
 * every page that shows a date.
 */
export function formatSettingsOf(
  org: { timezone?: unknown; locale?: unknown; currency?: unknown; dateFormat?: unknown; numberFormat?: unknown } | null | undefined,
): FormatSettings {
  const d = DEFAULT_FORMAT_SETTINGS;
  return {
    timezone: isTimezone(org?.timezone) ? org.timezone : d.timezone,
    locale: isLocale(org?.locale) ? org.locale : d.locale,
    currency: isCurrency(org?.currency) ? org.currency.toUpperCase() : d.currency,
    dateFormat: (DATE_FORMATS as readonly unknown[]).includes(org?.dateFormat) ? (org?.dateFormat as DateFormat) : d.dateFormat,
    numberFormat: (NUMBER_FORMATS as readonly unknown[]).includes(org?.numberFormat) ? (org?.numberFormat as NumberFormat) : d.numberFormat,
  };
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  monthName: string;
}

function partsIn(date: Date, timezone: string, locale: string): Parts {
  const numeric = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => numeric.find((p) => p.type === type)?.value ?? '';
  const monthName = new Intl.DateTimeFormat(locale, { timeZone: timezone, month: 'short' }).format(date);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), monthName };
}

function writeDate(parts: Parts, pattern: DateFormat): string {
  switch (pattern) {
    case 'DD/MM/YYYY':
      return `${parts.day}/${parts.month}/${parts.year}`;
    case 'MM/DD/YYYY':
      return `${parts.month}/${parts.day}/${parts.year}`;
    case 'D MMM YYYY':
      return `${Number(parts.day)} ${parts.monthName} ${parts.year}`;
    default:
      return `${parts.year}-${parts.month}-${parts.day}`;
  }
}

/** The date of an instant (something that happened at a moment), in the organisation's timezone. */
export function formatDate(value: DateInput, settings: FormatSettings): string {
  const date = toDate(value);
  return date ? writeDate(partsIn(date, settings.timezone, settings.locale), settings.dateFormat) : '—';
}

/** The date and 24-hour time of an instant, in the organisation's timezone. */
export function formatDateTime(value: DateInput, settings: FormatSettings): string {
  const date = toDate(value);
  if (!date) return '—';
  const parts = partsIn(date, settings.timezone, settings.locale);
  return `${writeDate(parts, settings.dateFormat)} ${parts.hour}:${parts.minute}`;
}

/**
 * A calendar day — the start or end of a period, stored as a UTC day. It is
 * the same day everywhere, so the timezone does not move it.
 */
export function formatDay(value: DateInput, settings: FormatSettings): string {
  const date = toDate(value);
  return date ? writeDate(partsIn(date, 'UTC', settings.locale), settings.dateFormat) : '—';
}

function group(digits: string, separator: string, indian: boolean): string {
  if (!indian) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  if (digits.length <= 3) return digits;
  // Indian grouping: the last three digits, then pairs.
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, separator);
  return `${head}${separator}${digits.slice(-3)}`;
}

/** A number in the organisation's style. Up to two decimal places unless asked otherwise. */
export function formatNumber(
  value: number | null | undefined,
  settings: FormatSettings,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const min = options.minimumFractionDigits ?? 0;
  const max = Math.max(options.maximumFractionDigits ?? 2, min);
  const style = SEPARATORS[settings.numberFormat] ?? SEPARATORS['1,234.56'];
  const fixed = Math.abs(value).toFixed(max);
  const [whole = '0', fraction = ''] = fixed.split('.');
  // Drop trailing zeros beyond the minimum asked for.
  const trimmed = fraction.replace(/0+$/, '').padEnd(min, '0');
  const negative = value < 0 && Number(fixed) !== 0;
  return `${negative ? '-' : ''}${group(whole, style.group, style.indian)}${trimmed ? `${style.decimal}${trimmed}` : ''}`;
}

/** An amount of money: the organisation's currency symbol and the number, to two places. */
export function formatCurrency(value: number | null | undefined, settings: FormatSettings): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const symbol =
    new Intl.NumberFormat(settings.locale, { style: 'currency', currency: settings.currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? settings.currency;
  const amount = formatNumber(Math.abs(value), settings, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}${symbol}${amount}`;
}
