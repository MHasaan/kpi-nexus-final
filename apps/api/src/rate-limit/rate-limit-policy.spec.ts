import { describe, expect, it } from 'vitest';

import { DEFAULT_BUDGETS, budgetsFromEnv, rateLimitEnabled, resolveRateLimits } from './rate-limit-policy.js';

type Principal = { type: 'user' | 'api_key'; id: string } | null;
const req = (path: string, extra: Partial<{ ip: string; principal: Principal; method: string; body: unknown }> = {}) => ({
  path,
  ip: extra.ip ?? '1.2.3.4',
  principal: extra.principal ?? null,
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

  it('signed-in users get their own bucket: colleagues and a shared office IP never share it', () => {
    const user = (id: string, ip: string) => resolveRateLimits(req('/kpis', { ip, principal: { type: 'user', id } }), DEFAULT_BUDGETS);
    expect(user('u1', '10.0.0.1')).toEqual([{ limit: 600, windowSec: 60, bucketKey: 'rl:user:u1' }]);
    // Same office IP, different user -> a different bucket.
    expect(user('u2', '10.0.0.1')[0]!.bucketKey).toBe('rl:user:u2');
    // Same user from another IP -> the same bucket (spreading across IPs doesn't help).
    expect(user('u1', '10.9.9.9')[0]!.bucketKey).toBe('rl:user:u1');
  });

  it('API keys get a bucket per key', () => {
    expect(resolveRateLimits(req('/kpis', { principal: { type: 'api_key', id: 'k1' } }), DEFAULT_BUDGETS)).toEqual([
      { limit: 600, windowSec: 60, bucketKey: 'rl:apikey:k1' },
    ]);
  });

  it('requests without a login fall back to a stricter per-IP bucket', () => {
    expect(resolveRateLimits(req('/health'), DEFAULT_BUDGETS)).toEqual([{ limit: 300, windowSec: 60, bucketKey: 'rl:ip:1.2.3.4' }]);
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
    expect(resolveRateLimits(req('/onboarding/:id'), DEFAULT_BUDGETS)[0]!.bucketKey).toBe('rl:ip:1.2.3.4');
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
  it('reads the per-user and anonymous budgets; RATE_LIMIT_ORG_PER_MIN still works as the old name', () => {
    expect(budgetsFromEnv({ RATE_LIMIT_USER_PER_MIN: '900', RATE_LIMIT_ANON_PER_MIN: '50' })).toMatchObject({
      userPerMin: 900,
      anonPerIpPerMin: 50,
    });
    expect(budgetsFromEnv({ RATE_LIMIT_ORG_PER_MIN: '777' }).userPerMin).toBe(777);
    expect(budgetsFromEnv({ RATE_LIMIT_USER_PER_MIN: '1', RATE_LIMIT_ORG_PER_MIN: '777' }).userPerMin).toBe(1);
  });

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
