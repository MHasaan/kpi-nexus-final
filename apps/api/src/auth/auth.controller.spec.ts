/**
 * Unit tests for AuthController.me()
 *
 * Verifies that GET /auth/me includes a resolved `permissions` array inside
 * the `user` object. Two cases per spec §5.4:
 *
 *  - Admin principal  → permissions contains every PermissionKey (18 keys)
 *  - Non-admin user   → permissions contains exactly the keys returned by the resolver
 *
 * Prisma and PermissionResolverService are mocked; no NestJS bootstrap needed.
 */
import { describe, expect, test, vi } from 'vitest';

import { ALL_PERMISSIONS, PermissionKey } from '@kpi-nexus/contracts';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { AuthController } from './auth.controller.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import type { AuthService } from './auth.service.js';

// ---------------------------------------------------------------------------
// Shared fake context
// ---------------------------------------------------------------------------
const fakeCtx: RequestContext = {
  organizationId: 'org_test',
  userId: 'user_test',
  roleId: 'role_test',
  principalType: 'user',
};

const fakeDbUser = {
  id: 'user_test',
  email: 'test@example.com',
  fullName: 'Test User',
  organizationId: 'org_test',
  roleId: 'role_test',
  mfaEnabled: false,
  status: 'ACTIVE',
  notificationSettings: null,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function makeController(resolverResult: {
  isAdmin: boolean;
  permissions: ReadonlySet<PermissionKey>;
}): AuthController {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(fakeDbUser),
    },
  } as unknown as PrismaService;

  const resolver = {
    resolveForCurrentPrincipal: vi.fn().mockResolvedValue(resolverResult),
  } as unknown as PermissionResolverService;

  // AuthService is required by the constructor but not used by me()
  const auth = {} as AuthService;

  return new AuthController(auth, prisma, resolver);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthController.me()', () => {
  test('admin principal — user.permissions contains all 18 PermissionKeys', async () => {
    const controller = makeController({
      isAdmin: true,
      permissions: new Set<PermissionKey>(), // admin bypass; actual set is empty
    });

    const result = await RequestContextStore.run(fakeCtx, () => controller.me());

    expect(result.user.permissions).toBeDefined();
    expect(Array.isArray(result.user.permissions)).toBe(true);
    // Must contain every canonical key
    for (const key of ALL_PERMISSIONS) {
      expect(result.user.permissions).toContain(key);
    }
    // Must not be empty
    expect(result.user.permissions.length).toBe(ALL_PERMISSIONS.length);
  });

  test('non-admin principal — user.permissions contains exactly the resolved 2 keys', async () => {
    const resolvedKeys = new Set<PermissionKey>([
      PermissionKey.KPI_VIEW,
      PermissionKey.DASHBOARD_VIEW,
    ]);
    const controller = makeController({ isAdmin: false, permissions: resolvedKeys });

    const result = await RequestContextStore.run(fakeCtx, () => controller.me());

    expect(result.user.permissions).toBeDefined();
    expect(Array.isArray(result.user.permissions)).toBe(true);
    expect(result.user.permissions).toHaveLength(2);
    expect(result.user.permissions).toContain(PermissionKey.KPI_VIEW);
    expect(result.user.permissions).toContain(PermissionKey.DASHBOARD_VIEW);
  });
});
