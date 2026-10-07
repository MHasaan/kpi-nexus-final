import { describe, expect, it } from 'vitest';

import { DEFAULT_BUDGETS, budgetsFromEnv, rateLimitEnabled, resolveRateLimits } from './rate-limit-policy.js';

const req = (path: string, extra: Partial<{ ip: string; orgId: string | null; method: string; body: unknown }> = {}) => ({
  path,
  ip: extra.ip ?? '1.2.3.4',
  orgId: extra.orgId ?? null,
  method: extra.method ?? 'GET',
  body: extra.body,
});

describe('resolveRateLimits', () => {
  it('applies a strict per-IP limit to auth routes', () => {
    const [p] = resolveRateLimits(req('/auth/password/request-reset', { method: 'POST' }), DEFAULT_BUDGETS);
    expect(p).toEqual({ limit: 10, windowSec: 60, bucketKey: 'rl:auth:1.2.3.4' });
  });

  it('login also gets a per-ACCOUNT bucket (distributed brute force on one account)', () => {
    const policies = resolveRateLimits(req('/auth/login', { method: 'POST', body: { email: ' Ada@Example.TEST ' } }), DEFAULT_BUDGETS);
    expect(policies).toContainEqual({ limit: 10, windowSec: 60, bucketKey: 'rl:auth:1.2.3.4' });
    expect(policies).toContainEqual({ limit: 20, windowSec: 900, bucketKey: 'rl:login:ada@example.test' });
  });

  it('login without an email only gets the per-IP bucket', () => {
    expect(resolveRateLimits(req('/auth/login', { method: 'POST', body: {} }), DEFAULT_BUDGETS)).toHaveLength(1);
  });

  it('applies a generous per-org limit to other routes, falling back to IP', () => {
    expect(resolveRateLimits(req('/kpis', { orgId: 'org1' }), DEFAULT_BUDGETS)).toEqual([{ limit: 600, windowSec: 60, bucketKey: 'rl:org:org1' }]);
    expect(resolveRateLimits(req('/health'), DEFAULT_BUDGETS)[0]!.bucketKey).toBe('rl:org:1.2.3.4');
  });

  it('anonymous onboarding start: strict per-IP hourly budget (BE-010)', () => {
    expect(resolveRateLimits(req('/onboarding/start', { method: 'POST' }), DEFAULT_BUDGETS)).toEqual([
      { limit: 10, windowSec: 3600, bucketKey: 'rl:onboarding-start:1.2.3.4' },
    ]);
  });

  it('anonymous onboarding AI: per-IP hourly budget only — the global cap is charged per real LLM call in the service (BE-010)', () => {
    expect(resolveRateLimits(req('/onboarding/ai/generate', { method: 'POST' }), DEFAULT_BUDGETS)).toEqual([
      { limit: 30, windowSec: 3600, bucketKey: 'rl:onboarding-ai:1.2.3.4' },
    ]);
  });

  it('other onboarding routes (draft read/update) keep the default bucket', () => {
    expect(resolveRateLimits(req('/onboarding/:id'), DEFAULT_BUDGETS)[0]!.bucketKey).toBe('rl:org:1.2.3.4');
  });

  it('uses configured budgets', () => {
    const b = { ...DEFAULT_BUDGETS, authPerIpPerMin: 500, loginPerAccountPer15Min: 3 };
    const policies = resolveRateLimits(req('/auth/login', { method: 'POST', body: { email: 'a@b.co' } }), b);
    expect(policies.map((p) => p.limit)).toEqual([500, 3]);
  });
});

describe('rateLimitEnabled', () => {
  it('is ON by default — only an explicit "false" disables it', () => {
    expect(rateLimitEnabled({})).toBe(true);
    expect(rateLimitEnabled({ RATE_LIMIT_ENABLED: 'true' })).toBe(true);
    expect(rateLimitEnabled({ RATE_LIMIT_ENABLED: 'false' })).toBe(false);
  });
});

describe('budgetsFromEnv', () => {
  it('reads positive integers and ignores junk', () => {
    expect(budgetsFromEnv({ RATE_LIMIT_AUTH_PER_MIN: '1000', RATE_LIMIT_LOGIN_PER_ACCOUNT: 'abc' })).toEqual({
      ...DEFAULT_BUDGETS,
      authPerIpPerMin: 1000,
    });
  });

  it('reads the onboarding budgets (BE-010)', () => {
    expect(
      budgetsFromEnv({
        RATE_LIMIT_ONBOARDING_START_PER_HOUR: '3',
        RATE_LIMIT_ONBOARDING_AI_PER_HOUR: '7',
        RATE_LIMIT_ONBOARDING_AI_GLOBAL_PER_DAY: '1',
      }),
    ).toEqual({ ...DEFAULT_BUDGETS, onboardingStartPerHour: 3, onboardingAiPerIpPerHour: 7, onboardingAiGlobalPerDay: 1 });
  });
});
