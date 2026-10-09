import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitService } from './rate-limit.service.js';

function ctx(url = '/kpis', ip = '1.1.1.1', body?: unknown, method = 'GET', user?: Record<string, unknown>) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ url, ip, method, body, routeOptions: { url }, user }) }),
  } as unknown as Parameters<RateLimitGuard['canActivate']>[0];
}

const svc = (allowed: (key: string) => boolean) =>
  ({ consume: vi.fn(async (key: string) => ({ allowed: allowed(key), remaining: 0 })) }) as unknown as RateLimitService & {
    consume: ReturnType<typeof vi.fn>;
  };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('RateLimitGuard', () => {
  it('keys signed-in requests by user from req.user (guards run before the request context exists)', async () => {
    const s = svc(() => true);
    await new RateLimitGuard(s).canActivate(
      ctx('/kpis', '1.1.1.1', undefined, 'GET', { userId: 'u42', organizationId: 'o1', principalType: 'user' }),
    );
    expect(s.consume.mock.calls[0]![0]).toBe('rl:user:u42');
  });

  it('keys API-key requests by key id', async () => {
    const s = svc(() => true);
    await new RateLimitGuard(s).canActivate(
      ctx('/kpis', '1.1.1.1', undefined, 'GET', { userId: 'u1', organizationId: 'o1', principalType: 'api_key', apiKeyId: 'k9' }),
    );
    expect(s.consume.mock.calls[0]![0]).toBe('rl:apikey:k9');
  });

  it('is ON by default (BE-017) — limits apply with no env set', async () => {
    const guard = new RateLimitGuard(svc(() => false));
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({ status: 429 });
  });

  it('can be switched off explicitly', async () => {
    vi.stubEnv('RATE_LIMIT_ENABLED', 'false');
    const s = svc(() => false);
    await expect(new RateLimitGuard(s).canActivate(ctx())).resolves.toBe(true);
    expect(s.consume).not.toHaveBeenCalled();
  });

  it('allows when under every bucket', async () => {
    const s = svc(() => true);
    await expect(new RateLimitGuard(s).canActivate(ctx())).resolves.toBe(true);
    expect(s.consume).toHaveBeenCalledOnce();
  });

  it('login: blocks when the per-ACCOUNT bucket is exhausted even if the IP bucket is fine', async () => {
    const s = svc((key) => !key.startsWith('rl:login:'));
    const guard = new RateLimitGuard(s);
    await expect(guard.canActivate(ctx('/auth/login', '9.9.9.9', { email: 'victim@example.test' }, 'POST'))).rejects.toMatchObject({ status: 429 });
    expect(s.consume.mock.calls.map((c) => c[0])).toEqual(['rl:auth:9.9.9.9', 'rl:login:victim@example.test']);
  });
});
