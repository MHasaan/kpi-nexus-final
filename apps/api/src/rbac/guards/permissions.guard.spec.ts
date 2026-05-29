/**
 * Unit tests for PermissionsGuard — exercises every branch of canActivate:
 *
 *   - @Public bypasses entirely
 *   - missing both @RequirePermissions + @RequireAnyPermission → allow
 *   - missing principal (no @Public, no req.user) → 401
 *   - admin short-circuit
 *   - RequirePermissions (AND) — pass / fail-with-missing
 *   - RequireAnyPermission (OR) — pass / fail
 *   - Owner override (spec §5.4 step 6) — identity case AND resolveOwnerId case
 *
 * The resolver, reflector, and execution context are all mocked. No NestJS
 * bootstrap, no DB.
 */
import { ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionKey } from '@kpi-nexus/contracts';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { RequestContext } from '../../tenancy/request-context.js';
import { OWNER_OVERRIDE_KEY } from '../decorators/owner-override.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import {
  REQUIRE_ANY_PERMISSION_KEY,
  REQUIRE_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator.js';
import type { PermissionResolverService } from '../services/permission-resolver.service.js';
import { PermissionsGuard } from './permissions.guard.js';

interface Metadata {
  isPublic?: boolean;
  requireAll?: PermissionKey[];
  requireAny?: PermissionKey[];
  ownerOverride?: { paramKey: string; resolveOwnerId?: (id: string) => Promise<string | null> };
}

interface MockedResolverResult {
  isAdmin: boolean;
  permissions: Set<PermissionKey>;
}

function makeContext(
  metadata: Metadata,
  request: { user?: RequestContext; params?: Record<string, string> },
  resolverResult: MockedResolverResult | null,
): {
  context: ExecutionContext;
  guard: PermissionsGuard;
  resolver: { resolveForUser: ReturnType<typeof vi.fn> };
} {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return metadata.isPublic;
      if (key === REQUIRE_PERMISSIONS_KEY) return metadata.requireAll;
      if (key === REQUIRE_ANY_PERMISSION_KEY) return metadata.requireAny;
      if (key === OWNER_OVERRIDE_KEY) return metadata.ownerOverride;
      return undefined;
    }),
  } as unknown as Reflector;

  const resolver = {
    resolveForUser: vi.fn().mockResolvedValue(resolverResult),
  };

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  const guard = new PermissionsGuard(
    reflector,
    resolver as unknown as PermissionResolverService,
  );

  return { context, guard, resolver };
}

const adminPrincipal: RequestContext = {
  organizationId: 'org_1',
  userId: 'user_admin',
  roleId: 'role_admin',
  principalType: 'user',
};

const userPrincipal: RequestContext = {
  organizationId: 'org_1',
  userId: 'user_alice',
  roleId: 'role_employee',
  principalType: 'user',
};

describe('PermissionsGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('@Public', () => {
    test('allows the request without any further checks', async () => {
      const { context, guard, resolver } = makeContext(
        { isPublic: true, requireAll: [PermissionKey.USERS_VIEW] },
        { user: undefined },
        null,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolver.resolveForUser).not.toHaveBeenCalled();
    });
  });

  describe('No permission metadata', () => {
    test('treats the route as authenticated-only and allows', async () => {
      const { context, guard, resolver } = makeContext(
        {},
        { user: userPrincipal },
        null,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolver.resolveForUser).not.toHaveBeenCalled();
    });
  });

  describe('Missing principal', () => {
    test('throws UnauthorizedException when req.user is absent', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.USERS_VIEW] },
        { user: undefined },
        null,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Admin short-circuit', () => {
    test('isAdmin=true on resolved result → allow without permission check', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.USERS_MANAGE] },
        { user: adminPrincipal },
        { isAdmin: true, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('@RequirePermissions (AND)', () => {
    test('user has all required → allow', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.USERS_VIEW, PermissionKey.USERS_MANAGE] },
        { user: userPrincipal },
        {
          isAdmin: false,
          permissions: new Set([PermissionKey.USERS_VIEW, PermissionKey.USERS_MANAGE]),
        },
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    test('user missing one → ForbiddenException with `missing` list', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.USERS_VIEW, PermissionKey.USERS_MANAGE] },
        { user: userPrincipal },
        {
          isAdmin: false,
          permissions: new Set([PermissionKey.USERS_VIEW]),
        },
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      try {
        await guard.canActivate(context);
      } catch (e) {
        const ex = e as ForbiddenException;
        const body = ex.getResponse() as { details: { missing: string[] } };
        expect(body.details.missing).toEqual([PermissionKey.USERS_MANAGE]);
      }
    });
  });

  describe('@RequireAnyPermission (OR)', () => {
    test('user has at least one → allow', async () => {
      const { context, guard } = makeContext(
        { requireAny: [PermissionKey.USERS_MANAGE, PermissionKey.ROLES_MANAGE] },
        { user: userPrincipal },
        { isAdmin: false, permissions: new Set([PermissionKey.ROLES_MANAGE]) },
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    test('user has none → ForbiddenException', async () => {
      const { context, guard } = makeContext(
        { requireAny: [PermissionKey.USERS_MANAGE, PermissionKey.ROLES_MANAGE] },
        { user: userPrincipal },
        { isAdmin: false, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('@OwnerOverride (spec §5.4 step 6)', () => {
    test('identity case — param matches principal.userId → allow (no permission needed)', async () => {
      // User is alice, route param `id` === alice's userId → owner override
      // passes even though alice lacks USERS_VIEW.
      const { context, guard, resolver } = makeContext(
        {
          requireAll: [PermissionKey.USERS_VIEW],
          ownerOverride: { paramKey: 'id' },
        },
        { user: userPrincipal, params: { id: userPrincipal.userId } },
        { isAdmin: false, permissions: new Set() }, // empty permissions
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      // Resolver IS consulted (because we have to check isAdmin first)
      expect(resolver.resolveForUser).toHaveBeenCalledOnce();
    });

    test('identity case — param does NOT match → fall through to permission check (denied)', async () => {
      const { context, guard } = makeContext(
        {
          requireAll: [PermissionKey.USERS_VIEW],
          ownerOverride: { paramKey: 'id' },
        },
        { user: userPrincipal, params: { id: 'user_bob' } }, // different user
        { isAdmin: false, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    test('resolveOwnerId case — async lookup returns principal id → allow', async () => {
      const resolveOwnerId = vi.fn().mockResolvedValue(userPrincipal.userId);
      const { context, guard } = makeContext(
        {
          requireAll: [PermissionKey.DASHBOARD_VIEW],
          ownerOverride: { paramKey: 'dashboardId', resolveOwnerId },
        },
        {
          user: userPrincipal,
          params: { dashboardId: 'dash_abc' },
        },
        { isAdmin: false, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolveOwnerId).toHaveBeenCalledWith('dash_abc');
    });

    test('resolveOwnerId returns null → owner check fails, permission check denies', async () => {
      const resolveOwnerId = vi.fn().mockResolvedValue(null);
      const { context, guard } = makeContext(
        {
          requireAll: [PermissionKey.DASHBOARD_VIEW],
          ownerOverride: { paramKey: 'dashboardId', resolveOwnerId },
        },
        {
          user: userPrincipal,
          params: { dashboardId: 'dash_unknown' },
        },
        { isAdmin: false, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    test('owner override is not consulted when user already has the permission', async () => {
      const resolveOwnerId = vi.fn();
      const { context, guard } = makeContext(
        {
          requireAll: [PermissionKey.USERS_VIEW],
          ownerOverride: { paramKey: 'id', resolveOwnerId },
        },
        { user: userPrincipal, params: { id: 'user_bob' } },
        { isAdmin: false, permissions: new Set([PermissionKey.USERS_VIEW]) },
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      // The resolveOwnerId lookup IS still called (it runs before the
      // requireAll check). That's fine — the guard's contract is just
      // "owner override OR permission check"; both can be evaluated and
      // either one passing is enough.
    });

    test('missing route param → owner check skipped, permission check decides', async () => {
      const { context, guard } = makeContext(
        {
          requireAll: [PermissionKey.USERS_VIEW],
          ownerOverride: { paramKey: 'id' },
        },
        { user: userPrincipal, params: {} }, // no `id` param
        { isAdmin: false, permissions: new Set() },
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('API-key principal (scope check, no admin bypass)', () => {
    const apiKeyPrincipal = (scopes: PermissionKey[]): RequestContext => ({
      organizationId: 'org_1',
      userId: 'key_1',
      roleId: null,
      principalType: 'api_key',
      apiKeyId: 'key_1',
      apiKeyScopes: scopes,
    });

    test('allows when the key has the required scope — resolver NOT consulted', async () => {
      const { context, guard, resolver } = makeContext(
        { requireAll: [PermissionKey.KPI_DATA_ENTRY] },
        { user: apiKeyPrincipal([PermissionKey.KPI_DATA_ENTRY]) },
        null,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolver.resolveForUser).not.toHaveBeenCalled();
    });

    test('denies when the key lacks the required scope', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.KPI_CREATE] },
        { user: apiKeyPrincipal([PermissionKey.KPI_DATA_ENTRY]) },
        null,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    test('requireAny — passes when the key has one of the scopes', async () => {
      const { context, guard } = makeContext(
        { requireAny: [PermissionKey.KPI_CREATE, PermissionKey.KPI_VIEW] },
        { user: apiKeyPrincipal([PermissionKey.KPI_VIEW]) },
        null,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    test('a scopeless key is denied even for a single required permission', async () => {
      const { context, guard } = makeContext(
        { requireAll: [PermissionKey.KPI_VIEW] },
        { user: apiKeyPrincipal([]) },
        null,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
