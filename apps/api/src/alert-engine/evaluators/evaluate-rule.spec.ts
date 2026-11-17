import { describe, expect, it } from 'vitest';

import { evaluateRule, ruleNeeds } from './evaluate-rule.js';

const inputs = (value: number, history: number[] = [], baselines: Array<[number, number | null]> = []) => ({
  value,
  history,
  baselines: new Map(baselines),
});

const over100 = { ruleType: 'STATIC_THRESHOLD', config: { operator: '>', value: 100 } };
const rose20 = { ruleType: 'RATE_OF_CHANGE', config: { pctChange: 20, windowMinutes: 60 } };
const unusual = { ruleType: 'DYNAMIC_STDDEV', config: { sigmas: 3, windowSize: 6 } };

describe('evaluateRule', () => {
  it('judges each type from the same inputs', () => {
    expect(evaluateRule('STATIC_THRESHOLD', over100.config, inputs(150)).triggered).toBe(true);
    expect(evaluateRule('RATE_OF_CHANGE', rose20.config, inputs(150, [], [[60, 100]])).triggered).toBe(true);
    expect(evaluateRule('RATE_OF_CHANGE', rose20.config, inputs(150, [], [[30, 100]])).triggered).toBe(false); // another rule's window
    expect(evaluateRule('DYNAMIC_STDDEV', unusual.config, inputs(150, [98, 102, 98, 102, 98, 102])).triggered).toBe(true);
  });

  it('a stored config that does not fit its type does not trigger, and does not throw', () => {
    expect(evaluateRule('STATIC_THRESHOLD', { operator: 'near', value: 'ten' }, inputs(150)).triggered).toBe(false);
    expect(evaluateRule('DYNAMIC_STDDEV', null, inputs(150)).triggered).toBe(false);
    expect(evaluateRule('SOMETHING_ELSE', {}, inputs(150)).triggered).toBe(false);
  });

  it('NO_DATA is not judged when a value arrives', () => {
    expect(evaluateRule('NO_DATA', { maxStaleMinutes: 1 }, inputs(150)).triggered).toBe(false);
  });
});

describe('composite rules', () => {
  it('AND holds only when every part does, and says each reason', () => {
    const config = { operator: 'AND', rules: [over100, rose20] };
    const both = evaluateRule('COMPOSITE', config, inputs(150, [], [[60, 100]]));
    expect(both.triggered).toBe(true);
    expect(both.message).toBe('Value 150 > threshold 100 and Value rose 50% (from 100 to 150) within 1 hour');
    expect(evaluateRule('COMPOSITE', config, inputs(150, [], [[60, 140]])).triggered).toBe(false);
    expect(evaluateRule('COMPOSITE', config, inputs(90, [], [[60, 50]])).triggered).toBe(false);
  });

  it('OR holds when any part does, and gives only the reasons that held', () => {
    const config = { operator: 'OR', rules: [over100, rose20] };
    const one = evaluateRule('COMPOSITE', config, inputs(90, [], [[60, 50]]));
    expect(one.triggered).toBe(true);
    expect(one.message).toBe('Value rose 80% (from 50 to 90) within 1 hour');
    expect(evaluateRule('COMPOSITE', config, inputs(90, [], [[60, 89]])).triggered).toBe(false);
  });

  it('a part that cannot be judged counts as not holding', () => {
    const broken = { ruleType: 'STATIC_THRESHOLD', config: { nonsense: true } };
    expect(evaluateRule('COMPOSITE', { operator: 'AND', rules: [over100, broken] }, inputs(150)).triggered).toBe(false);
    expect(evaluateRule('COMPOSITE', { operator: 'OR', rules: [over100, broken] }, inputs(150)).triggered).toBe(true);
    const stale = { ruleType: 'NO_DATA', config: { maxStaleMinutes: 5 } };
    expect(evaluateRule('COMPOSITE', { operator: 'AND', rules: [over100, stale] }, inputs(150)).triggered).toBe(false);
  });
});

describe('ruleNeeds', () => {
  it('nothing to load for threshold rules alone', () => {
    expect(ruleNeeds([over100])).toEqual({ historySize: 0, windows: new Set() });
  });

  it('the widest std-dev window and every rate window, composite parts included', () => {
    const needs = ruleNeeds([
      unusual,
      { ruleType: 'DYNAMIC_STDDEV', config: { sigmas: 2, windowSize: 30 } },
      rose20,
      { ruleType: 'COMPOSITE', config: { operator: 'OR', rules: [{ ruleType: 'RATE_OF_CHANGE', config: { pctChange: -5, windowMinutes: 1440 } }, over100] } },
    ]);
    expect(needs.historySize).toBe(30);
    expect([...needs.windows].sort((a, b) => a - b)).toEqual([60, 1440]);
  });
});
