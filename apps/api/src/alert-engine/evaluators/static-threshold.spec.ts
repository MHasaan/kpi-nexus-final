import { describe, expect, it } from 'vitest';

import type { StaticThresholdConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { evaluateStaticThreshold } from './static-threshold.js';

const cfg = (
  operator: StaticThresholdConfig['operator'],
  value: number,
): StaticThresholdConfig => ({ operator, value });

describe('evaluateStaticThreshold', () => {
  it('> triggers when value exceeds threshold', () => {
    expect(evaluateStaticThreshold(cfg('>', 100), 101).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('>', 100), 100).triggered).toBe(false);
    expect(evaluateStaticThreshold(cfg('>', 100), 99).triggered).toBe(false);
  });

  it('< triggers when value is below threshold', () => {
    expect(evaluateStaticThreshold(cfg('<', 50), 49).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('<', 50), 50).triggered).toBe(false);
    expect(evaluateStaticThreshold(cfg('<', 50), 51).triggered).toBe(false);
  });

  it('>= is inclusive at the boundary', () => {
    expect(evaluateStaticThreshold(cfg('>=', 100), 100).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('>=', 100), 99).triggered).toBe(false);
  });

  it('<= is inclusive at the boundary', () => {
    expect(evaluateStaticThreshold(cfg('<=', 100), 100).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('<=', 100), 101).triggered).toBe(false);
  });

  it('== triggers only on exact equality', () => {
    expect(evaluateStaticThreshold(cfg('==', 0), 0).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('==', 0), 0.0001).triggered).toBe(false);
  });

  it('handles negative values and zero threshold', () => {
    expect(evaluateStaticThreshold(cfg('<', 0), -5).triggered).toBe(true);
    expect(evaluateStaticThreshold(cfg('>', -10), -5).triggered).toBe(true);
  });

  it('sets a descriptive message only when triggered', () => {
    const hit = evaluateStaticThreshold(cfg('>', 100), 150);
    expect(hit.message).toContain('150');
    expect(hit.message).toContain('100');
    const miss = evaluateStaticThreshold(cfg('>', 100), 50);
    expect(miss.message).toBeUndefined();
  });
});
