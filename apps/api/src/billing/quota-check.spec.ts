import { describe, expect, it } from 'vitest';

import { checkQuota, resolveLimit } from './quota-check.js';

describe('checkQuota', () => {
  it('allows when unlimited (limit <= 0)', () => {
    expect(checkQuota(0, 9999, 1)).toBe(true);
    expect(checkQuota(-1, 100, 50)).toBe(true);
  });

  it('allows when the increment stays within the limit', () => {
    expect(checkQuota(10, 9, 1)).toBe(true); // 9 + 1 = 10 <= 10
    expect(checkQuota(10, 0, 10)).toBe(true);
  });

  it('rejects when the increment would exceed the limit', () => {
    expect(checkQuota(10, 10, 1)).toBe(false); // already at cap
    expect(checkQuota(10, 9, 2)).toBe(false);
  });
});

describe('resolveLimit', () => {
  const quotas = { kpis: 10, dashboards: 5 };
  it('reads a numeric quota by key', () => {
    expect(resolveLimit(quotas, 'kpis')).toBe(10);
  });
  it('treats a missing key as unlimited (0)', () => {
    expect(resolveLimit(quotas, 'unknown')).toBe(0);
  });
  it('coerces non-numeric quota values to unlimited', () => {
    expect(resolveLimit({ kpis: 'lots' as unknown as number }, 'kpis')).toBe(0);
    expect(resolveLimit(null, 'kpis')).toBe(0);
  });
});
