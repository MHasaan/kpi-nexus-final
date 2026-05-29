import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitService } from './rate-limit.service.js';

function ctx(url = '/kpis', ip = '1.1.1.1') {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ url, ip, routeOptions: { url } }) }),
  } as unknown as Parameters<RateLimitGuard['canActivate']>[0];
}

const allowSvc = { consume: vi.fn(async () => ({ allowed: true, remaining: 5 })) } as unknown as RateLimitService;
const blockSvc = { consume: vi.fn(async () => ({ allowed: false, remaining: 0 })) } as unknown as RateLimitService;

afterEach(() => {
  delete process.env.RATE_LIMIT_ENABLED;
  vi.clearAllMocks();
});

describe('RateLimitGuard', () => {
  it('is a no-op when disabled (default) — never touches the service', async () => {
    delete process.env.RATE_LIMIT_ENABLED;
    const guard = new RateLimitGuard(blockSvc);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect((blockSvc.consume as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('allows when enabled and under the limit', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    const guard = new RateLimitGuard(allowSvc);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(allowSvc.consume).toHaveBeenCalledOnce();
  });

  it('throws 429 when enabled and over the limit', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    const guard = new RateLimitGuard(blockSvc);
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({ status: 429 });
  });
});
