import { describe, expect, test } from 'vitest';

import { isOnHold } from './settings-on-hold';

// UI-014: single sign-on and the custom domain are hidden until they are built (owner decision 2026-11-20).
describe('isOnHold', () => {
  test('single sign-on and the custom domain are on hold', () => {
    expect(isOnHold('/settings/sso')).toBe(true);
    expect(isOnHold('/settings/custom-domain')).toBe(true);
  });

  test('every other settings page is not', () => {
    for (const href of ['/settings/organization', '/settings/password-policy', '/settings/scim', '/settings/ai', '/billing']) {
      expect(isOnHold(href)).toBe(false);
    }
  });
});
