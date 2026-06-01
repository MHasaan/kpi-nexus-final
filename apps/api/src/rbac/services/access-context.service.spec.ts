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

  test('individual with no managed units ⇒ DIRECT_REPORTS default scope', async () => {
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
    expect(profile.scopeByDomain.KPIS).toBe('DIRECT_REPORTS');
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
