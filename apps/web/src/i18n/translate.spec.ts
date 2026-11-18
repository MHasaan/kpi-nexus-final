import { SUPPORTED_LOCALES } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { LOCALES, isRtl } from './dictionaries';
import { normalizeLocale, translate } from './translate';

describe('translate', () => {
  test('returns the locale string when present', () => {
    expect(translate('ur-PK', 'profile.title')).toBe('پروفائل');
  });
  test('falls back to en-US for an untranslated locale (es)', () => {
    expect(translate('es', 'profile.title')).toBe('Profile');
  });
  test('falls back to the key itself when unknown', () => {
    expect(translate('en-US', 'nonexistent.key')).toBe('nonexistent.key');
  });
});

describe('normalizeLocale', () => {
  test('passes through a known locale', () => {
    expect(normalizeLocale('ur-PK')).toBe('ur-PK');
  });
  test('defaults unknown / null to en-US', () => {
    expect(normalizeLocale('xx-YY')).toBe('en-US');
    expect(normalizeLocale(null)).toBe('en-US');
  });
});

describe('isRtl', () => {
  test('ur-PK is RTL; en-US is not', () => {
    expect(isRtl('ur-PK')).toBe(true);
    expect(isRtl('en-US')).toBe(false);
  });
});

describe('languages', () => {
  test('the languages the app has are the ones an account may save (plan 6.2)', () => {
    expect([...LOCALES]).toEqual([...SUPPORTED_LOCALES]);
  });
});
