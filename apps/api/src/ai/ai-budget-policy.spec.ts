import { describe, expect, it } from 'vitest';

import { evaluateBudget, shouldRollDaily, shouldRollMonthly } from './ai-budget-policy.js';

const base = {
  dailySpend: 0,
  monthlySpend: 0,
  dailyCapUsd: 1,
  monthlyCapUsd: 30,
  circuitBreaker: 'FAIL_CLOSED' as const,
};

describe('evaluateBudget (pre-flight gating)', () => {
  it('allows a call well under both caps', () => {
    expect(evaluateBudget(base, 0.01).allowed).toBe(true);
  });

  it('blocks with DAILY_CAP when the daily cap would be exceeded', () => {
    const d = evaluateBudget({ ...base, dailySpend: 0.99 }, 0.02);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('DAILY_CAP');
  });

  it('blocks with MONTHLY_CAP when only the monthly cap would be exceeded', () => {
    const d = evaluateBudget({ ...base, monthlySpend: 29.99, dailyCapUsd: 100 }, 0.02);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('MONTHLY_CAP');
  });

  it('checks the daily cap before the monthly cap when both would exceed', () => {
    const d = evaluateBudget({ ...base, dailySpend: 1, monthlySpend: 30 }, 0.5);
    expect(d.reason).toBe('DAILY_CAP');
  });

  it('allows a call landing exactly on the cap (<= cap)', () => {
    expect(evaluateBudget({ ...base, dailySpend: 0.9 }, 0.1).allowed).toBe(true);
  });

  it('blocks a call one cent over the cap', () => {
    expect(evaluateBudget({ ...base, dailySpend: 0.9 }, 0.11).allowed).toBe(false);
  });

  it('treats a daily cap of 0 as unlimited', () => {
    expect(
      evaluateBudget({ ...base, dailyCapUsd: 0, dailySpend: 1000, monthlyCapUsd: 100000 }, 50).allowed,
    ).toBe(true);
  });

  it('treats a monthly cap of 0 as unlimited', () => {
    expect(
      evaluateBudget({ ...base, monthlyCapUsd: 0, monthlySpend: 1000, dailyCapUsd: 0 }, 50).allowed,
    ).toBe(true);
  });

  it('surfaces the circuit-breaker mode so the router can decide to fall back', () => {
    const d = evaluateBudget({ ...base, dailySpend: 1, circuitBreaker: 'FALLBACK' }, 0.5);
    expect(d.allowed).toBe(false);
    expect(d.mode).toBe('FALLBACK');
  });

  it('reports zero free cost as always allowed even at the cap', () => {
    expect(evaluateBudget({ ...base, dailySpend: 1, monthlySpend: 30 }, 0).allowed).toBe(true);
  });
});

describe('window rollover (UTC)', () => {
  const may29 = Date.UTC(2026, 4, 29, 10, 0, 0);
  it('rolls the daily window across a UTC day boundary', () => {
    expect(shouldRollDaily(may29, Date.UTC(2026, 4, 30, 1, 0, 0))).toBe(true);
    expect(shouldRollDaily(may29, Date.UTC(2026, 4, 29, 23, 0, 0))).toBe(false);
  });

  it('rolls the monthly window across a UTC month boundary', () => {
    expect(shouldRollMonthly(may29, Date.UTC(2026, 5, 1, 0, 0, 0))).toBe(true);
    expect(shouldRollMonthly(may29, Date.UTC(2026, 4, 31, 23, 0, 0))).toBe(false);
  });
});
