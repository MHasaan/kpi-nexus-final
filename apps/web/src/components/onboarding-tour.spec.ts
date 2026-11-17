import { describe, expect, test } from 'vitest';

import { shouldShowTour } from './onboarding-tour';

describe('shouldShowTour', () => {
  test('someone whose account has not finished the tour sees it', () => {
    expect(shouldShowTour(null, null)).toBe(true);
    expect(shouldShowTour(null, undefined)).toBe(true);
  });

  test('once the account has finished it, it is not shown again — on any browser', () => {
    expect(shouldShowTour(null, '2026-11-17T10:00:00.000Z')).toBe(false);
  });

  test('a browser that dismissed it before completion moved to the account is left alone', () => {
    expect(shouldShowTour('1', null)).toBe(false);
  });
});
