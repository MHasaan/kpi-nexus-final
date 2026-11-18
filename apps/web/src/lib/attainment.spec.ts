import { describe, expect, test } from 'vitest';

import { attainmentOf } from './attainment';

// The same rule as the API's `attainmentPct` (apps/api/src/kpis/kpi-health.ts), for a person's own
// figure against their own target, which the API's KPI-level status does not know.
describe('attainmentOf — how far a value has come towards a target', () => {
  test('higher is better: the value as a share of the target', () => {
    expect(attainmentOf(30, 40, 'HIGHER_IS_BETTER')).toBe(75);
    expect(attainmentOf(50, 40, 'HIGHER_IS_BETTER')).toBe(125);
  });

  test('lower is better: the target as a share of the value', () => {
    expect(attainmentOf(8, 5, 'LOWER_IS_BETTER')).toBe(62.5);
  });

  test('nothing to compare, or a direction with no better side, gives none', () => {
    expect(attainmentOf(null, 40, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentOf(30, null, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentOf(30, 0, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentOf(0, 5, 'LOWER_IS_BETTER')).toBeNull();
    expect(attainmentOf(30, 40, 'NEUTRAL')).toBeNull();
  });
});
