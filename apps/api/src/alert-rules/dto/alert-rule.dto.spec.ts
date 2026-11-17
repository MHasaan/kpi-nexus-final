import { describe, expect, test } from 'vitest';

import { CompositeConfigSchema, CreateAlertRuleDtoSchema, RateOfChangeConfigSchema } from './alert-rule.dto.js';

describe('RateOfChangeConfigSchema', () => {
  test('the percentage carries its direction; zero has none', () => {
    expect(RateOfChangeConfigSchema.safeParse({ pctChange: 20, windowMinutes: 60 }).success).toBe(true);
    expect(RateOfChangeConfigSchema.safeParse({ pctChange: -20, windowMinutes: 60 }).success).toBe(true);
    const zero = RateOfChangeConfigSchema.safeParse({ pctChange: 0, windowMinutes: 60 });
    expect(zero.success).toBe(false);
    expect(zero.error?.issues[0]?.message).toMatch(/other than zero/);
  });
});

describe('CompositeConfigSchema', () => {
  const threshold = { ruleType: 'STATIC_THRESHOLD', config: { operator: '<', value: 80 } };

  test('each part is checked as its own kind', () => {
    expect(
      CompositeConfigSchema.safeParse({
        operator: 'AND',
        rules: [threshold, { ruleType: 'RATE_OF_CHANGE', config: { pctChange: -20, windowMinutes: 1440 } }, { ruleType: 'DYNAMIC_STDDEV', config: { sigmas: 3, windowSize: 12 } }],
      }).success,
    ).toBe(true);
    // Used to be accepted as "any JSON", saved, and never able to fire.
    expect(CompositeConfigSchema.safeParse({ operator: 'AND', rules: [{ ruleType: 'STATIC_THRESHOLD', config: { anything: 'goes' } }] }).success).toBe(false);
  });

  test('"no data" cannot be a part: it never holds at the moment a value arrives', () => {
    expect(CompositeConfigSchema.safeParse({ operator: 'OR', rules: [threshold, { ruleType: 'NO_DATA', config: { maxStaleMinutes: 60 } }] }).success).toBe(false);
  });

  test('a composite cannot contain a composite', () => {
    expect(CompositeConfigSchema.safeParse({ operator: 'OR', rules: [{ ruleType: 'COMPOSITE', config: { operator: 'AND', rules: [threshold] } }] }).success).toBe(false);
  });
});

describe('CreateAlertRuleDtoSchema', () => {
  test('a composite rule is created with typed parts', () => {
    const parsed = CreateAlertRuleDtoSchema.safeParse({
      kpiId: 'k1',
      name: 'Low and falling',
      ruleType: 'COMPOSITE',
      config: { operator: 'AND', rules: [{ ruleType: 'STATIC_THRESHOLD', config: { operator: '<', value: 80 } }] },
    });
    expect(parsed.success).toBe(true);
  });
});
