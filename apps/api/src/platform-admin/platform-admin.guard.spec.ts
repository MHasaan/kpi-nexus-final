import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlatformAdminGuard } from './platform-admin.guard.js';
import type { PlatformAdminService } from './platform-admin.service.js';

/**
 * Guards run BEFORE the tenancy interceptor, so there is no RequestContextStore
 * here in production — the principal is `req.user`, set by JwtAuthGuard. These
 * tests deliberately run without an ALS context (BE-006: the old guard read the
 * empty store and 403'd every caller with "Authentication required").
 */
function httpContext(user: { userId: string } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as Parameters<PlatformAdminGuard['canActivate']>[0];
}

function run(svc: Partial<PlatformAdminService>, userId: string | null) {
  const guard = new PlatformAdminGuard(svc as PlatformAdminService);
  return guard.canActivate(httpContext(userId ? { userId } : undefined));
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('PlatformAdminGuard', () => {
  it('allows an existing platform admin (principal from req.user, no ALS context)', async () => {
    const isPlatformAdmin = vi.fn(async () => true);
    await expect(run({ isPlatformAdmin, count: vi.fn(async () => 3) }, 'u1')).resolves.toBe(true);
    expect(isPlatformAdmin).toHaveBeenCalledWith('u1');
  });

  it('an empty table does NOT let any user in by default (anyone can register an org)', async () => {
    await expect(
      run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 0) }, 'u1'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('bootstraps the first admin only when PLATFORM_ADMIN_BOOTSTRAP_OPEN=true', async () => {
    vi.stubEnv('PLATFORM_ADMIN_BOOTSTRAP_OPEN', 'true');
    await expect(run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 0) }, 'u1')).resolves.toBe(true);
    // ...and never once an admin exists.
    await expect(
      run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 1) }, 'u1'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('denies a non-admin with a message that says why', async () => {
    await expect(
      run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 2) }, 'u1'),
    ).rejects.toMatchObject({ status: 403, response: { code: 'NOT_PLATFORM_ADMIN' } });
  });

  it('denies an unauthenticated caller with 401', async () => {
    await expect(run({}, null)).rejects.toMatchObject({ status: 401 });
  });
});
