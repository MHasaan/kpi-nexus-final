import { describe, expect, test } from 'vitest';

import { RETENTION_ENTITY_TYPES, RETENTION_TIERS, resolveTierDays } from './retention-tiers.js';

describe('retention tiers', () => {
  test('three tiers with ascending retention', () => {
    expect(RETENTION_TIERS.FREE).toBe(90);
    expect(RETENTION_TIERS.PRO).toBe(365);
    expect(RETENTION_TIERS.ENTERPRISE).toBe(2555);
    expect(RETENTION_TIERS.FREE).toBeLessThan(RETENTION_TIERS.PRO);
    expect(RETENTION_TIERS.PRO).toBeLessThan(RETENTION_TIERS.ENTERPRISE);
  });

  test('resolveTierDays returns the day count for a tier', () => {
    expect(resolveTierDays('PRO')).toBe(365);
  });

  test('resolveTierDays throws on an unknown tier', () => {
    expect(() => resolveTierDays('GOLD' as 'FREE')).toThrow();
  });

  test('entity-type list is non-empty', () => {
    expect(RETENTION_ENTITY_TYPES.length).toBeGreaterThan(0);
  });
});
