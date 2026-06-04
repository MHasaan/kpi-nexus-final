/**
 * Unit tests for AccessContextService — admin short-circuit, managed-vs-member
 * unit split, recursive direct-report resolution, derived default scope, and
 * the per-`org:user` cache. Pure-unit: Prisma + resolver are mocked, no NestJS
 * bootstrap. Runs inside RequestContextStore.run() to supply the principal.
 */
import { describe, expect, test, vi } from 'vitest';

import { PERMISSION_COUNT, PermissionKey } from '@kpi-nexus/contracts';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../../tenancy/request-context.js';
import { AccessContextService } from './access-context.service.js';
import type { PermissionResolverService } from './permission-resolver.service.js';

const ORG = 'org_alpha';

interface FakeMembership {
  userId: string;
  orgUnitId: string;
  memberRole: 'MEMBER' | 'MANAGER' | 'LEAD' | 'DEPUTY';
  leftAt: Date | null;
}
interface FakeUser {
  id: string;
  organizationId: string;
  managerId: string | null;
}

class FakePrisma {
  memberships: FakeMembership[] = [];
  users: FakeUser[] = [];
  /** config returned by roleDefinition.findFirst (null ⇒ derived defaults / parity). */
  roleScopeConfig: unknown = null;
  roleDataTypeConfig: unknown = null;
  roleDataLimits: unknown = null;
  /** the org the fake role actually belongs to — the org-scoped read must match it. */
  roleOrg: string = ORG;

  roleDefinition = {
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
      if (where.organizationId !== this.roleOrg) return null; // cross-tenant guard
      return {
        scopeConfig: this.roleScopeConfig,
        dataTypeConfig: this.roleDataTypeConfig,
        dataLimits: this.roleDataLimits,
      };
    }),
  };

  /** Phase 3.5 — ResourcePermission grant rows. Each call returns the subset
   *  matching the org + (user OR role) subject + non-expired-expiry where. */
  grants: Array<{
    organizationId: string;
    subjectType: 'user' | 'role';
    subjectId: string;
    resourceType: string;
    resourceId: string;
    action: string;
    expiresAt: Date | null;
  }> = [];
  resourcePermission = {
    findMany: vi.fn(async ({ where }: { where: any }) => {
      const now = new Date();
      const subjectMatches = (g: { subjectType: string; subjectId: string }) =>
        (where.OR as Array<{ subjectType: string; subjectId: string }>).some(
          (s) => s.subjectType === g.subjectType && s.subjectId === g.subjectId,
        );
      return this.grants
        .filter(
          (g) =>
            g.organizationId === where.organizationId &&
            subjectMatches(g) &&
            (g.expiresAt === null || g.expiresAt > now),
        )
        .map((g) => ({
          resourceType: g.resourceType,
          resourceId: g.resourceId,
          action: g.action,
        }));
    }),
  };

  /** Phase 5 — per-user override row (null ⇒ no override ⇒ role value). */
  userOverride: {
    scopeConfig?: unknown;
    dataTypeConfig?: unknown;
    dataLimits?: unknown;
  } | null = null;
  /** the org the override belongs to — the org-scoped read must match it. */
  userOverrideOrg: string = ORG;
  userAccessOverride = {
    findFirst: vi.fn(async ({ where }: { where: { organizationId: string; userId: string } }) =>
      where.organizationId === this.userOverrideOrg ? this.userOverride : null,
    ),
  };

  orgUnitMember = {
    findMany: vi.fn(async ({ where }: { where: any }) => {
      // Shape A — membership-by-user (resolveForCurrentPrincipal).
      if (where.userId !== undefined) {
        return this.memberships
          .filter((m) => m.userId === where.userId && m.leftAt === null)
          .map((m) => ({ orgUnitId: m.orgUnitId, memberRole: m.memberRole }));
      }
      // Shape B — members-of-units (unitMemberUserIds): where.orgUnitId.in.
      const unitIds: string[] = where.orgUnitId?.in ?? [];
      return this.memberships
        .filter((m) => unitIds.includes(m.orgUnitId) && m.leftAt === null)
        .map((m) => ({ userId: m.userId }));
    }),
  };

  user = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; managerId: { in: string[] } };
      }) =>
        this.users
          .filter(
            (u) =>
              u.organizationId === where.organizationId &&
              u.managerId !== null &&
              where.managerId.in.includes(u.managerId),
          )
          .map((u) => ({ id: u.id })),
    ),
  };
}

function makeResolver(isAdmin: boolean, permissions: PermissionKey[]): PermissionResolverService {
  return {
    resolveForUser: vi.fn(async () => ({
      isAdmin,
      permissions: new Set(permissions),
      resolvedAt: Date.now(),
      fromDelegations: [],
    })),
  } as unknown as PermissionResolverService;
}

const ctx: RequestContext = {
  userId: 'm1',
  organizationId: ORG,
  roleId: 'r1',
  principalType: 'user',
};

function run<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

describe('AccessContextService', () => {
  test('admin short-circuits — ORG scope everywhere, empty context, no membership queries', async () => {
    const prisma = new FakePrisma();
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(true, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.isAdmin).toBe(true);
    expect(profile.capabilities).toHaveLength(PERMISSION_COUNT); // admin ⇒ all 25
    expect(profile.scopeByDomain.KPIS).toBe('ORG');
    expect(profile.scopeByDomain.ORG).toBe('ORG');
    expect(profile.context.managedOrgUnitIds).toEqual([]);
    expect(profile.context.directReportIds).toEqual([]);
    expect(prisma.orgUnitMember.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test('resolves managed vs member units + recursive direct reports; manager ⇒ UNITS scope', async () => {
    const prisma = new FakePrisma();
    // m1 MANAGES unitX, is a plain MEMBER of unitY, and has LEFT unitZ (filtered out).
    prisma.memberships = [
      { userId: 'm1', orgUnitId: 'unitX', memberRole: 'MANAGER', leftAt: null },
      { userId: 'm1', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
      { userId: 'm1', orgUnitId: 'unitZ', memberRole: 'MANAGER', leftAt: new Date() },
    ];
    // m1 → [a, b]; b → [c]  ⇒ recursive reports = a, b, c
    prisma.users = [
      { id: 'a', organizationId: ORG, managerId: 'm1' },
      { id: 'b', organizationId: ORG, managerId: 'm1' },
      { id: 'c', organizationId: ORG, managerId: 'b' },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, [PermissionKey.KPI_VIEW]),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.isAdmin).toBe(false);
    expect(profile.capabilities).toContain(PermissionKey.KPI_VIEW);
    expect(profile.context.managedOrgUnitIds).toEqual(['unitX']);
    expect(profile.context.memberOrgUnitIds).toEqual(['unitY']);
    expect(profile.context.directReportIds).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(profile.context.directReportIds).toHaveLength(3);
    expect(profile.scopeByDomain.KPIS).toBe('UNITS');
  });

  test('non-admin default scope is per-domain (KPIS=UNITS, DASHBOARDS=SELF) — parity baseline', async () => {
    const prisma = new FakePrisma();
    prisma.memberships = [
      { userId: 'm1', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.context.managedOrgUnitIds).toEqual([]);
    expect(profile.scopeByDomain.KPIS).toBe('UNITS');
    expect(profile.scopeByDomain.DASHBOARDS).toBe('SELF');
  });

  test('role scopeConfig overrides the default per domain', async () => {
    const prisma = new FakePrisma();
    prisma.roleScopeConfig = { KPIS: 'SELF', DASHBOARDS: 'ORG' };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.scopeByDomain.KPIS).toBe('SELF'); // narrowed by config
    expect(profile.scopeByDomain.DASHBOARDS).toBe('ORG'); // widened by config
    expect(profile.scopeByDomain.ALERTS).toBe('ORG'); // unset ⇒ per-domain default (ALERTS=ORG)
  });

  test('role dataLimits resolve onto the profile; admin stays unlimited (null)', async () => {
    const prisma = new FakePrisma();
    prisma.roleDataLimits = { historyWindowDays: 90, maxExportRows: 5000 };
    const nonAdmin = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const profile = await run(() => nonAdmin.resolveForCurrentPrincipal());
    expect(profile.dataLimits.historyWindowDays).toBe(90);
    expect(profile.dataLimits.maxExportRows).toBe(5000);
    expect(profile.dataLimits.maxListRows).toBeNull(); // unset ⇒ null

    const adminPrisma = new FakePrisma();
    adminPrisma.roleDataLimits = { historyWindowDays: 7 };
    const admin = new AccessContextService(
      adminPrisma as unknown as PrismaService,
      makeResolver(true, []),
    );
    const adminProfile = await run(() => admin.resolveForCurrentPrincipal());
    expect(adminProfile.dataLimits.historyWindowDays).toBeNull(); // admin ⇒ unlimited
  });

  test('per-user override REPLACES role scope/dataType/limits per field (Phase 5)', async () => {
    const prisma = new FakePrisma();
    // Role says UNITS + a category allowlist + a 90-day window…
    prisma.roleScopeConfig = { KPIS: 'UNITS' };
    prisma.roleDataTypeConfig = { kpiCategoryIds: ['cat_role'] };
    prisma.roleDataLimits = { historyWindowDays: 90, maxListRows: 1000 };
    // …the user override narrows KPIS to SELF, swaps the category, tightens the window,
    // and leaves maxListRows unset (⇒ inherits the role's 1000).
    prisma.userOverride = {
      scopeConfig: { KPIS: 'SELF' },
      dataTypeConfig: { kpiCategoryIds: ['cat_user'] },
      dataLimits: { historyWindowDays: 7 },
    };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.scopeByDomain.KPIS).toBe('SELF'); // override replaced role UNITS
    expect(profile.scopeByDomain.DASHBOARDS).toBe('SELF'); // unset everywhere ⇒ per-domain default (DASHBOARDS=SELF)
    expect(profile.dataTypeFilters.kpiCategoryIds).toEqual(['cat_user']); // override replaced
    expect(profile.dataLimits.historyWindowDays).toBe(7); // override tightened
    expect(profile.dataLimits.maxListRows).toBe(1000); // override unset ⇒ role value
  });

  test('an override belonging to another org is NOT applied (org-scoped read)', async () => {
    const prisma = new FakePrisma();
    prisma.roleScopeConfig = { KPIS: 'UNITS' };
    prisma.userOverride = { scopeConfig: { KPIS: 'SELF' } };
    prisma.userOverrideOrg = 'org_other'; // override lives in a different tenant
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const profile = await run(() => svc.resolveForCurrentPrincipal());
    expect(profile.scopeByDomain.KPIS).toBe('UNITS'); // foreign override ignored ⇒ role value
  });

  test('per-user override can WIDEN scope (e.g. ORG) over a narrower role', async () => {
    const prisma = new FakePrisma();
    prisma.roleScopeConfig = { KPIS: 'SELF' };
    prisma.userOverride = { scopeConfig: { KPIS: 'ORG' } };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const profile = await run(() => svc.resolveForCurrentPrincipal());
    expect(profile.scopeByDomain.KPIS).toBe('ORG');
  });

  test('admins ignore the per-user override (not even read)', async () => {
    const prisma = new FakePrisma();
    prisma.userOverride = { scopeConfig: { KPIS: 'SELF' }, dataLimits: { historyWindowDays: 1 } };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(true, []),
    );
    const profile = await run(() => svc.resolveForCurrentPrincipal());
    expect(profile.scopeByDomain.KPIS).toBe('ORG');
    expect(profile.dataLimits.historyWindowDays).toBeNull();
    expect(prisma.userAccessOverride.findFirst).not.toHaveBeenCalled();
  });

  test('dataLimits() returns all-null under bypassDataLimits even with a configured role', async () => {
    const prisma = new FakePrisma();
    prisma.roleDataLimits = { historyWindowDays: 30, maxExportRows: 100 };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    // Normal context ⇒ the role's limits apply.
    const normal = await run(() => svc.dataLimits());
    expect(normal.historyWindowDays).toBe(30);

    // System batch context (e.g. scheduled-report processor) ⇒ limits suppressed.
    const bypassed = (await RequestContextStore.run(
      { ...ctx, bypassDataLimits: true },
      () => svc.dataLimits(),
    )) as Awaited<ReturnType<typeof svc.dataLimits>>;
    expect(bypassed.historyWindowDays).toBeNull();
    expect(bypassed.maxExportRows).toBeNull();
  });

  test('non-admin default dataTypeFilters are all-null (parity baseline)', async () => {
    const prisma = new FakePrisma();
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.dataTypeFilters.kpiCategoryIds).toBeNull();
    expect(profile.dataTypeFilters.orgUnitIds).toBeNull();
  });

  test('role dataTypeConfig sets the KPI category allowlist; admin stays null', async () => {
    const prisma = new FakePrisma();
    prisma.roleDataTypeConfig = { kpiCategoryIds: ['cat_sales', 'cat_finance'] };
    const nonAdmin = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const nonAdminProfile = await run(() => nonAdmin.resolveForCurrentPrincipal());
    expect(nonAdminProfile.dataTypeFilters.kpiCategoryIds).toEqual(['cat_sales', 'cat_finance']);

    const adminPrisma = new FakePrisma();
    adminPrisma.roleDataTypeConfig = { kpiCategoryIds: ['cat_sales'] };
    const admin = new AccessContextService(
      adminPrisma as unknown as PrismaService,
      makeResolver(true, []),
    );
    const adminProfile = await run(() => admin.resolveForCurrentPrincipal());
    expect(adminProfile.dataTypeFilters.kpiCategoryIds).toBeNull();
    expect(adminPrisma.roleDefinition.findFirst).not.toHaveBeenCalled();
  });

  test('a foreign-tenant roleId resolves to defaults, never another org config', async () => {
    const prisma = new FakePrisma();
    prisma.roleOrg = 'org_other'; // the role lives in a different tenant
    prisma.roleScopeConfig = { KPIS: 'SELF' };
    prisma.roleDataTypeConfig = { kpiCategoryIds: ['secret'] };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    // The org-scoped read returned null ⇒ defaults/parity, NOT the foreign config.
    expect(profile.scopeByDomain.KPIS).toBe('UNITS');
    expect(profile.dataTypeFilters.kpiCategoryIds).toBeNull();
  });

  test('admin ignores scopeConfig (always ORG)', async () => {
    const prisma = new FakePrisma();
    prisma.roleScopeConfig = { KPIS: 'SELF' };
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(true, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.scopeByDomain.KPIS).toBe('ORG');
    expect(prisma.roleDefinition.findFirst).not.toHaveBeenCalled();
  });

  test('non-admin profile carries user + role ResourcePermission grants; expired excluded (Phase 3.5)', async () => {
    const prisma = new FakePrisma();
    prisma.grants = [
      // user grant (m1) — included
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'dashboard',
        resourceId: 'dUser',
        action: 'view',
        expiresAt: null,
      },
      // role grant (r1) — included
      {
        organizationId: ORG,
        subjectType: 'role',
        subjectId: 'r1',
        resourceType: 'dashboard',
        resourceId: 'dRole',
        action: 'manage',
        expiresAt: null,
      },
      // expired user grant — excluded
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'dashboard',
        resourceId: 'dExpired',
        action: 'view',
        expiresAt: new Date(Date.now() - 1000),
      },
      // another user's grant — excluded (subject mismatch)
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'other',
        resourceType: 'dashboard',
        resourceId: 'dOther',
        action: 'view',
        expiresAt: null,
      },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());

    expect(profile.resourceGrants).toEqual(
      expect.arrayContaining([
        { resourceType: 'dashboard', resourceId: 'dUser', action: 'view' },
        { resourceType: 'dashboard', resourceId: 'dRole', action: 'manage' },
      ]),
    );
    expect(profile.resourceGrants).toHaveLength(2);
    expect(profile.resourceGrants.map((g) => g.resourceId)).not.toContain('dExpired');
    expect(profile.resourceGrants.map((g) => g.resourceId)).not.toContain('dOther');
  });

  test('grantedResourceIds filters by type + acceptable actions', async () => {
    const prisma = new FakePrisma();
    prisma.grants = [
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'dashboard',
        resourceId: 'dView',
        action: 'view',
        expiresAt: null,
      },
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'dashboard',
        resourceId: 'dDelete',
        action: 'delete',
        expiresAt: null,
      },
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'kpi',
        resourceId: 'kView',
        action: 'view',
        expiresAt: null,
      },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    const ids = await run(() => svc.grantedResourceIds('dashboard', ['view', 'manage']));
    expect(ids).toEqual(['dView']); // dDelete (wrong action) + kView (wrong type) excluded
  });

  test('admin ⇒ resourceGrants is empty and resourcePermission is not queried (Phase 3.5)', async () => {
    const prisma = new FakePrisma();
    prisma.grants = [
      {
        organizationId: ORG,
        subjectType: 'user',
        subjectId: 'm1',
        resourceType: 'dashboard',
        resourceId: 'dUser',
        action: 'view',
        expiresAt: null,
      },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(true, []),
    );

    const profile = await run(() => svc.resolveForCurrentPrincipal());
    expect(profile.resourceGrants).toEqual([]);
    expect(prisma.resourcePermission.findMany).not.toHaveBeenCalled();
  });

  test('caches per org:user — a second resolve does not re-query; invalidate clears it', async () => {
    const prisma = new FakePrisma();
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );

    await run(() => svc.resolveForCurrentPrincipal());
    await run(() => svc.resolveForCurrentPrincipal());
    expect(prisma.orgUnitMember.findMany).toHaveBeenCalledTimes(1);

    svc.invalidate(ORG, 'm1');
    await run(() => svc.resolveForCurrentPrincipal());
    expect(prisma.orgUnitMember.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('AccessContextService.unitMemberUserIds (Phase 2.5)', () => {
  test('returns distinct active members of the principal’s managed ∪ member units', async () => {
    const prisma = new FakePrisma();
    // m1 manages unitX and is a plain member of unitY; peers populate both units.
    prisma.memberships = [
      { userId: 'm1', orgUnitId: 'unitX', memberRole: 'MANAGER', leftAt: null },
      { userId: 'm1', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
      { userId: 'peer1', orgUnitId: 'unitX', memberRole: 'MEMBER', leftAt: null },
      { userId: 'peer2', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
      { userId: 'peer1', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null }, // same user, 2nd unit ⇒ dedup
      { userId: 'gone', orgUnitId: 'unitX', memberRole: 'MEMBER', leftAt: new Date() }, // left ⇒ excluded
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    const ids = await run(() => svc.unitMemberUserIds());
    expect(new Set(ids)).toEqual(new Set(['m1', 'peer1', 'peer2']));
  });

  test('admin ⇒ empty (admins never scope by unit membership)', async () => {
    const prisma = new FakePrisma();
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(true, []),
    );
    expect(await run(() => svc.unitMemberUserIds())).toEqual([]);
  });

  test('principal in no units ⇒ empty', async () => {
    const prisma = new FakePrisma();
    prisma.memberships = []; // m1 belongs to nothing
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    expect(await run(() => svc.unitMemberUserIds())).toEqual([]);
  });

  test('caches per org:user; invalidate clears it', async () => {
    const prisma = new FakePrisma();
    prisma.memberships = [
      { userId: 'm1', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
      { userId: 'peer2', orgUnitId: 'unitY', memberRole: 'MEMBER', leftAt: null },
    ];
    const svc = new AccessContextService(
      prisma as unknown as PrismaService,
      makeResolver(false, []),
    );
    await run(() => svc.unitMemberUserIds());
    await run(() => svc.unitMemberUserIds());
    // 1st call: membership-by-user (for the profile) + members-of-units. 2nd call: both cached.
    expect(prisma.orgUnitMember.findMany).toHaveBeenCalledTimes(2);
    svc.invalidate(ORG, 'm1');
    await run(() => svc.unitMemberUserIds());
    expect(prisma.orgUnitMember.findMany).toHaveBeenCalledTimes(4);
  });
});
