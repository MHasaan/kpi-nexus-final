/**
 * Comprehensive unit tests for PermissionResolverService covering every
 * branch of spec §5.4 resolution (steps 3, 4, 5) + hasResourcePermission
 * + cache invariants. Pure-unit — Prisma is mocked, no NestJS bootstrap.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PermissionKey } from '@kpi-nexus/contracts';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../../tenancy/request-context.js';
import { PermissionResolverService } from './permission-resolver.service.js';

interface FakeRole {
  id: string;
  organizationId: string;
  isAdmin: boolean;
  permissions: string[];
}

interface FakeInheritance {
  organizationId: string;
  childRoleId: string;
  parentRoleId: string;
  parentRole: { isAdmin: boolean; permissions: string[] };
  inheritsPermissions: boolean;
}

interface FakeDelegation {
  id: string;
  organizationId: string;
  granteeUserId: string;
  grantorUserId: string;
  permissions: string[];
  revokedAt: Date | null;
  validFrom: Date;
  validTo: Date;
}

interface FakeResourcePermission {
  organizationId: string;
  subjectType: 'user' | 'role';
  subjectId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  expiresAt: Date | null;
}

class FakePrisma {
  roleDefinitionStore: FakeRole[] = [];
  roleInheritanceStore: FakeInheritance[] = [];
  permissionDelegationStore: FakeDelegation[] = [];
  resourcePermissionStore: FakeResourcePermission[] = [];

  roleDefinition = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return this.roleDefinitionStore.find((r) => r.id === where.id) ?? null;
    }),
  };

  roleInheritance = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          organizationId: string;
          childRoleId: string;
          inheritsPermissions: boolean;
        };
      }) => {
        return this.roleInheritanceStore.filter(
          (e) =>
            e.organizationId === where.organizationId &&
            e.childRoleId === where.childRoleId &&
            e.inheritsPermissions === where.inheritsPermissions,
        );
      },
    ),
  };

  permissionDelegation = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          organizationId: string;
          granteeUserId: string;
          revokedAt: null;
          validFrom: { lte: Date };
          validTo: { gte: Date };
        };
      }) => {
        const now = where.validFrom.lte; // we pass `now` for both bounds
        return this.permissionDelegationStore.filter(
          (d) =>
            d.organizationId === where.organizationId &&
            d.granteeUserId === where.granteeUserId &&
            d.revokedAt === null &&
            d.validFrom.getTime() <= now.getTime() &&
            d.validTo.getTime() >= now.getTime(),
        );
      },
    ),
  };

  resourcePermission = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: {
          organizationId: string;
          subjectType: 'user' | 'role';
          subjectId: string;
          action: string;
          resourceType: string;
          resourceId: string;
          OR: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
        };
      }) => {
        const now = (where.OR.find((c) => 'expiresAt' in c && c.expiresAt && 'gt' in c.expiresAt) as
          | { expiresAt: { gt: Date } }
          | undefined)?.expiresAt.gt;
        return (
          this.resourcePermissionStore.find(
            (rp) =>
              rp.organizationId === where.organizationId &&
              rp.subjectType === where.subjectType &&
              rp.subjectId === where.subjectId &&
              rp.action === where.action &&
              rp.resourceType === where.resourceType &&
              rp.resourceId === where.resourceId &&
              (rp.expiresAt === null || (now ? rp.expiresAt.getTime() > now.getTime() : true)),
          ) ?? null
        );
      },
    ),
  };
}

const ORG = 'org_alpha';
const OTHER_ORG = 'org_beta';

function makeResolver(): { resolver: PermissionResolverService; prisma: FakePrisma } {
  const prisma = new FakePrisma();
  const resolver = new PermissionResolverService(prisma as unknown as PrismaService);
  return { resolver, prisma };
}

describe('PermissionResolverService.resolveForUser', () => {
  test('with no roleId — empty permissions, not admin', async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveForUser(ORG, 'u1', null);
    expect(result.isAdmin).toBe(false);
    expect(result.permissions.size).toBe(0);
  });

  test('step 3 — role direct permissions land in the set', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: false,
      permissions: [PermissionKey.KPI_VIEW, PermissionKey.DASHBOARD_VIEW],
    });
    const result = await resolver.resolveForUser(ORG, 'u1', 'r1');
    expect(result.isAdmin).toBe(false);
    expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
    expect(result.permissions.has(PermissionKey.DASHBOARD_VIEW)).toBe(true);
    expect(result.permissions.size).toBe(2);
  });

  test('step 3 — role.isAdmin flips isAdmin and skips delegation lookup', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: true,
      permissions: [],
    });
    const result = await resolver.resolveForUser(ORG, 'u1', 'r1');
    expect(result.isAdmin).toBe(true);
    expect(prisma.permissionDelegation.findMany).not.toHaveBeenCalled();
  });

  test('role from a different tenant is ignored (organizationId mismatch)', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: OTHER_ORG,
      isAdmin: true,
      permissions: [PermissionKey.KPI_VIEW],
    });
    const result = await resolver.resolveForUser(ORG, 'u1', 'r1');
    expect(result.isAdmin).toBe(false);
    expect(result.permissions.size).toBe(0);
  });

  describe('step 4 — RoleInheritance BFS', () => {
    test('inherits parent permissions', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'child',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.roleInheritanceStore.push({
        organizationId: ORG,
        childRoleId: 'child',
        parentRoleId: 'parent',
        parentRole: { isAdmin: false, permissions: [PermissionKey.KPI_EDIT] },
        inheritsPermissions: true,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', 'child');
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.KPI_EDIT)).toBe(true);
    });

    test('inherits transitively (grandparent)', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'child',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.roleInheritanceStore.push(
        {
          organizationId: ORG,
          childRoleId: 'child',
          parentRoleId: 'parent',
          parentRole: { isAdmin: false, permissions: [PermissionKey.KPI_EDIT] },
          inheritsPermissions: true,
        },
        {
          organizationId: ORG,
          childRoleId: 'parent',
          parentRoleId: 'grandparent',
          parentRole: { isAdmin: false, permissions: [PermissionKey.DASHBOARD_MANAGE] },
          inheritsPermissions: true,
        },
      );
      const result = await resolver.resolveForUser(ORG, 'u1', 'child');
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.KPI_EDIT)).toBe(true);
      expect(result.permissions.has(PermissionKey.DASHBOARD_MANAGE)).toBe(true);
    });

    test('multi-parent (union without double-count)', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'child',
        organizationId: ORG,
        isAdmin: false,
        permissions: [],
      });
      prisma.roleInheritanceStore.push(
        {
          organizationId: ORG,
          childRoleId: 'child',
          parentRoleId: 'parent-a',
          parentRole: {
            isAdmin: false,
            permissions: [PermissionKey.KPI_VIEW, PermissionKey.KPI_EDIT],
          },
          inheritsPermissions: true,
        },
        {
          organizationId: ORG,
          childRoleId: 'child',
          parentRoleId: 'parent-b',
          parentRole: {
            isAdmin: false,
            permissions: [PermissionKey.KPI_EDIT, PermissionKey.DASHBOARD_VIEW],
          },
          inheritsPermissions: true,
        },
      );
      const result = await resolver.resolveForUser(ORG, 'u1', 'child');
      expect(result.permissions.size).toBe(3);
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.KPI_EDIT)).toBe(true);
      expect(result.permissions.has(PermissionKey.DASHBOARD_VIEW)).toBe(true);
    });

    test('cycle (A → B → A) terminates without hanging', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'role-a',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.roleInheritanceStore.push(
        {
          organizationId: ORG,
          childRoleId: 'role-a',
          parentRoleId: 'role-b',
          parentRole: { isAdmin: false, permissions: [PermissionKey.KPI_EDIT] },
          inheritsPermissions: true,
        },
        {
          organizationId: ORG,
          childRoleId: 'role-b',
          parentRoleId: 'role-a',
          parentRole: { isAdmin: false, permissions: [PermissionKey.KPI_VIEW] },
          inheritsPermissions: true,
        },
      );
      const result = await resolver.resolveForUser(ORG, 'u1', 'role-a');
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.KPI_EDIT)).toBe(true);
    });

    test('admin ancestor short-circuits to isAdmin=true', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'child',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.roleInheritanceStore.push({
        organizationId: ORG,
        childRoleId: 'child',
        parentRoleId: 'parent',
        parentRole: { isAdmin: true, permissions: [] },
        inheritsPermissions: true,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', 'child');
      expect(result.isAdmin).toBe(true);
    });

    test('inheritsPermissions=false edges are NOT followed', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'child',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.roleInheritanceStore.push({
        organizationId: ORG,
        childRoleId: 'child',
        parentRoleId: 'parent',
        parentRole: { isAdmin: false, permissions: [PermissionKey.KPI_EDIT] },
        inheritsPermissions: false,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', 'child');
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.KPI_EDIT)).toBe(false);
    });
  });

  describe('step 5 — PermissionDelegation', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const past = new Date('2026-05-01T00:00:00Z');
    const future = new Date('2026-07-01T00:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test('explicit permissions land in the union', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'r1',
        organizationId: ORG,
        isAdmin: false,
        permissions: [PermissionKey.KPI_VIEW],
      });
      prisma.permissionDelegationStore.push({
        id: 'd1',
        organizationId: ORG,
        grantorUserId: 'manager',
        granteeUserId: 'u1',
        permissions: [PermissionKey.USERS_VIEW, PermissionKey.ALERTS_VIEW],
        revokedAt: null,
        validFrom: past,
        validTo: future,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', 'r1');
      expect(result.permissions.has(PermissionKey.KPI_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.USERS_VIEW)).toBe(true);
      expect(result.permissions.has(PermissionKey.ALERTS_VIEW)).toBe(true);
      expect(result.fromDelegations).toEqual([{ delegationId: 'd1', grantorUserId: 'manager' }]);
    });

    test('empty permissions = "inherit ALL of grantor" — skipped with warn (deferred)', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.permissionDelegationStore.push({
        id: 'd-empty',
        organizationId: ORG,
        grantorUserId: 'manager',
        granteeUserId: 'u1',
        permissions: [],
        revokedAt: null,
        validFrom: past,
        validTo: future,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', null);
      expect(result.permissions.size).toBe(0);
      expect(result.fromDelegations).toEqual([]);
    });

    test('expired delegations are not loaded', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.permissionDelegationStore.push({
        id: 'd-expired',
        organizationId: ORG,
        grantorUserId: 'manager',
        granteeUserId: 'u1',
        permissions: [PermissionKey.USERS_VIEW],
        revokedAt: null,
        validFrom: past,
        validTo: new Date('2026-05-15T00:00:00Z'), // before "now"
      });
      const result = await resolver.resolveForUser(ORG, 'u1', null);
      expect(result.permissions.has(PermissionKey.USERS_VIEW)).toBe(false);
    });

    test('revoked delegations are not loaded', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.permissionDelegationStore.push({
        id: 'd-revoked',
        organizationId: ORG,
        grantorUserId: 'manager',
        granteeUserId: 'u1',
        permissions: [PermissionKey.USERS_VIEW],
        revokedAt: now,
        validFrom: past,
        validTo: future,
      });
      const result = await resolver.resolveForUser(ORG, 'u1', null);
      expect(result.permissions.has(PermissionKey.USERS_VIEW)).toBe(false);
    });

    test('admin user — delegations are not even looked up', async () => {
      const { resolver, prisma } = makeResolver();
      prisma.roleDefinitionStore.push({
        id: 'admin-role',
        organizationId: ORG,
        isAdmin: true,
        permissions: [],
      });
      const result = await resolver.resolveForUser(ORG, 'u1', 'admin-role');
      expect(result.isAdmin).toBe(true);
      expect(prisma.permissionDelegation.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('PermissionResolverService.hasResourcePermission', () => {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: ORG,
    roleId: 'r1',
    principalType: 'user',
  };

  test('admin short-circuits to true', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: true,
      permissions: [],
    });
    const result = await RequestContextStore.run(ctx, () =>
      resolver.hasResourcePermission('view', 'kpi', 'kpi-1'),
    );
    expect(result).toBe(true);
    expect(prisma.resourcePermission.findFirst).not.toHaveBeenCalled();
  });

  test('user-level grant matches → true', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({ id: 'r1', organizationId: ORG, isAdmin: false, permissions: [] });
    prisma.resourcePermissionStore.push({
      organizationId: ORG,
      subjectType: 'user',
      subjectId: 'u1',
      action: 'view',
      resourceType: 'kpi',
      resourceId: 'kpi-1',
      expiresAt: null,
    });
    const result = await RequestContextStore.run(ctx, () =>
      resolver.hasResourcePermission('view', 'kpi', 'kpi-1'),
    );
    expect(result).toBe(true);
  });

  test('role-level grant matches → true when no user-level grant', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({ id: 'r1', organizationId: ORG, isAdmin: false, permissions: [] });
    prisma.resourcePermissionStore.push({
      organizationId: ORG,
      subjectType: 'role',
      subjectId: 'r1',
      action: 'view',
      resourceType: 'kpi',
      resourceId: 'kpi-1',
      expiresAt: null,
    });
    const result = await RequestContextStore.run(ctx, () =>
      resolver.hasResourcePermission('view', 'kpi', 'kpi-1'),
    );
    expect(result).toBe(true);
  });

  test('no grant → false', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({ id: 'r1', organizationId: ORG, isAdmin: false, permissions: [] });
    const result = await RequestContextStore.run(ctx, () =>
      resolver.hasResourcePermission('view', 'kpi', 'kpi-1'),
    );
    expect(result).toBe(false);
  });

  test('action / resourceType / resourceId mismatch → false', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({ id: 'r1', organizationId: ORG, isAdmin: false, permissions: [] });
    prisma.resourcePermissionStore.push({
      organizationId: ORG,
      subjectType: 'user',
      subjectId: 'u1',
      action: 'edit',
      resourceType: 'kpi',
      resourceId: 'kpi-1',
      expiresAt: null,
    });
    const result = await RequestContextStore.run(ctx, () =>
      resolver.hasResourcePermission('view', 'kpi', 'kpi-1'),
    );
    expect(result).toBe(false);
  });
});

describe('PermissionResolverService.invalidate / invalidateAll', () => {
  test('cache hit on repeated call within TTL', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: false,
      permissions: [PermissionKey.KPI_VIEW],
    });
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    expect(prisma.roleDefinition.findUnique).toHaveBeenCalledTimes(1);
  });

  test('invalidate(orgId, userId) forces a fresh resolution for that user only', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: false,
      permissions: [PermissionKey.KPI_VIEW],
    });
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    await resolver.resolveForUser(ORG, 'u2', 'r1');
    resolver.invalidate(ORG, 'u1');
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    await resolver.resolveForUser(ORG, 'u2', 'r1');
    // u1 resolved twice (initial + post-invalidate), u2 once
    expect(prisma.roleDefinition.findUnique).toHaveBeenCalledTimes(3);
  });

  test('invalidateAll() clears every entry', async () => {
    const { resolver, prisma } = makeResolver();
    prisma.roleDefinitionStore.push({
      id: 'r1',
      organizationId: ORG,
      isAdmin: false,
      permissions: [PermissionKey.KPI_VIEW],
    });
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    await resolver.resolveForUser(ORG, 'u2', 'r1');
    resolver.invalidateAll();
    await resolver.resolveForUser(ORG, 'u1', 'r1');
    await resolver.resolveForUser(ORG, 'u2', 'r1');
    expect(prisma.roleDefinition.findUnique).toHaveBeenCalledTimes(4);
  });
});
