import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlatformAdminGuard } from './platform-admin.guard.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { PlatformAdminService } from './platform-admin.service.js';

const ctx = {} as unknown as Parameters<PlatformAdminGuard['canActivate']>[0];

function run(svc: Partial<PlatformAdminService>, userId: string | null) {
  const guard = new PlatformAdminGuard(svc as PlatformAdminService);
  if (!userId) return guard.canActivate(ctx); // no ALS context → get() undefined
  const context = { userId, organizationId: 'org1', roleId: null, principalType: 'user' as const };
  return RequestContextStore.run(context as never, () => guard.canActivate(ctx));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('PlatformAdminGuard', () => {
  it('allows an existing platform admin', async () => {
    await expect(run({ isPlatformAdmin: vi.fn(async () => true), count: vi.fn(async () => 3) }, 'u1')).resolves.toBe(true);
  });

  it('allows the first admin (bootstrap when table empty)', async () => {
    await expect(run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 0) }, 'u1')).resolves.toBe(true);
  });

  it('denies a non-admin when admins already exist', async () => {
    await expect(run({ isPlatformAdmin: vi.fn(async () => false), count: vi.fn(async () => 2) }, 'u1')).rejects.toMatchObject({ status: 403 });
  });

  it('denies an unauthenticated caller', async () => {
    await expect(run({}, null)).rejects.toMatchObject({ status: 403 });
  });
});
