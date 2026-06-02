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

  orgUnitMember = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; userId: string; leftAt: null };
      }) =>
        this.memberships
          .filter((m) => m.userId === where.userId && m.leftAt === null)
          .map((m) => ({ orgUnitId: m.orgUnitId, memberRole: m.memberRole })),
    ),
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

  test('non-admin default scope is UNITS for every domain (parity baseline)', async () => {
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
    expect(profile.scopeByDomain.DASHBOARDS).toBe('UNITS');
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
    expect(profile.scopeByDomain.ALERTS).toBe('UNITS'); // unset ⇒ default
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
