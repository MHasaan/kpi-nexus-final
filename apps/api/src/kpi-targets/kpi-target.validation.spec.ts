import { describe, expect, it } from 'vitest';

import { validateTarget } from './kpi-target.validation.js';

describe('validateTarget', () => {
  it('STATIC requires value', () => {
    expect(validateTarget({ type: 'STATIC' }, 'HIGHER_IS_BETTER')).toHaveLength(1);
    expect(validateTarget({ type: 'STATIC', value: 100 }, 'HIGHER_IS_BETTER')).toHaveLength(0);
  });

  it('DYNAMIC requires formula', () => {
    expect(validateTarget({ type: 'DYNAMIC' }, 'NEUTRAL')).toHaveLength(1);
    expect(validateTarget({ type: 'DYNAMIC', formula: 'avg(last30)' }, 'NEUTRAL')).toHaveLength(0);
  });

  it('TIME_VARYING requires effectiveFrom', () => {
    expect(validateTarget({ type: 'TIME_VARYING' }, 'NEUTRAL')).toHaveLength(1);
    expect(validateTarget({ type: 'TIME_VARYING', effectiveFrom: new Date() }, 'NEUTRAL')).toHaveLength(0);
  });

  it('CONDITIONAL requires metadata.condition', () => {
    expect(validateTarget({ type: 'CONDITIONAL' }, 'NEUTRAL')).toHaveLength(1);
    expect(validateTarget({ type: 'CONDITIONAL', metadata: { condition: 'x>1' } }, 'NEUTRAL')).toHaveLength(0);
  });

  it('SCENARIO requires scenarioName + bands', () => {
    expect(validateTarget({ type: 'SCENARIO' }, 'HIGHER_IS_BETTER').length).toBeGreaterThan(0);
    expect(
      validateTarget(
        { type: 'SCENARIO', scenarioName: 'Best case', minValue: 10, expectedValue: 20 },
        'HIGHER_IS_BETTER',
      ),
    ).toHaveLength(0);
  });

  it('TIERED requires at least one band', () => {
    expect(validateTarget({ type: 'TIERED' }, 'HIGHER_IS_BETTER')).toHaveLength(1);
  });

  it('TIERED enforces ascending bands for HIGHER_IS_BETTER', () => {
    expect(
      validateTarget({ type: 'TIERED', minValue: 10, expectedValue: 20, stretchValue: 30 }, 'HIGHER_IS_BETTER'),
    ).toHaveLength(0);
    expect(
      validateTarget({ type: 'TIERED', minValue: 30, expectedValue: 20, stretchValue: 10 }, 'HIGHER_IS_BETTER').length,
    ).toBeGreaterThan(0);
  });

  it('TIERED enforces descending bands for LOWER_IS_BETTER', () => {
    expect(
      validateTarget({ type: 'TIERED', minValue: 30, expectedValue: 20, stretchValue: 10 }, 'LOWER_IS_BETTER'),
    ).toHaveLength(0);
    expect(
      validateTarget({ type: 'TIERED', minValue: 10, expectedValue: 20, stretchValue: 30 }, 'LOWER_IS_BETTER').length,
    ).toBeGreaterThan(0);
  });

  it('NEUTRAL direction imposes no band ordering', () => {
    expect(
      validateTarget({ type: 'TIERED', minValue: 30, expectedValue: 5, stretchValue: 99 }, 'NEUTRAL'),
    ).toHaveLength(0);
  });
});
