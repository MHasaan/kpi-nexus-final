/**
 * KpiCascadesService — Layer-3 (Phase 3) KPI category-allowlist unit tests.
 *
 * Security focus: GET /kpi-cascades (list) and GET /kpi-cascades/all (tree) must
 * never surface parent/child KPI ids or names for KPIs outside the principal's
 * category allowlist. A pure unit: Prisma is an in-memory fake, AuditService /
 * CascadeService are no-op stubs, and AccessContextService is a fake that hands
 * back a configurable `kpiCategoryAllowlist()`.
 *
 * Semantics mirrored from `isCategoryAllowed`:
 *   - null allowlist ⇒ all (parity / admin) — nothing dropped
 *   - [ids] ⇒ only edges whose BOTH parent + child KPI categories are allowed
 *   - a KPI with categoryId === null is hidden once an allowlist is set
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { CascadeService } from '../kpis/cascade.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { KpiCascadesService } from './kpi-cascades.service.js';

const ORG = 'org_alpha';

interface FakeEdge {
  id: string;
  organizationId: string;
  parentKpiId: string;
  parentName: string;
  parentCategoryId: string | null;
  childKpiId: string;
  childName: string;
  childCategoryId: string | null;
  method: string;
  weight: number;
  level: number;
  customFormula: string | null;
  lastComputedAt: Date | null;
  createdAt: Date;
}

/**
 * Minimal Prisma fake. `kPICascade.findMany` honours `where.organizationId` and
 * projects each edge into the join shape both list() (select parentKpi/childKpi
 * categoryId) and tree() (include id/name/categoryId) consume.
 */
class FakePrisma {
  store: FakeEdge[] = [];

  kPICascade = {
    findMany: vi.fn(async ({ where }: { where: { organizationId?: string } }) => {
      return this.store
        .filter((e) => !where.organizationId || e.organizationId === where.organizationId)
        .map((e) => ({
          id: e.id,
          organizationId: e.organizationId,
          parentKpiId: e.parentKpiId,
          childKpiId: e.childKpiId,
          method: e.method,
          weight: e.weight,
          level: e.level,
          customFormula: e.customFormula,
          lastComputedAt: e.lastComputedAt,
          createdAt: e.createdAt,
          parentKpi: { id: e.parentKpiId, name: e.parentName, categoryId: e.parentCategoryId },
          childKpi: { id: e.childKpiId, name: e.childName, categoryId: e.childCategoryId },
        }));
    }),
  };
}

class FakeAudit {
  record = vi.fn(async () => undefined);
}

class FakeCascade {
  computeForParent = vi.fn(async () => ({}) as never);
}

class FakeAccessContext {
  allowlist: readonly string[] | null = null;
  kpiCategoryAllowlist = vi.fn(async () => this.allowlist);
}

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: ORG,
    roleId: 'role_member',
    principalType: 'user',
  };
  return RequestContextStore.run(ctx, fn);
}

function makeService(): {
  service: KpiCascadesService;
  prisma: FakePrisma;
  accessContext: FakeAccessContext;
} {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const cascade = new FakeCascade();
  const accessContext = new FakeAccessContext();
  const service = new KpiCascadesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    cascade as unknown as CascadeService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, accessContext };
}

function makeEdge(over: Partial<FakeEdge> = {}): FakeEdge {
  return {
    id: 'edge_x',
    organizationId: ORG,
    parentKpiId: 'kpi_parent',
    parentName: 'Parent KPI',
    parentCategoryId: 'cat_finance',
    childKpiId: 'kpi_child',
    childName: 'Child KPI',
    childCategoryId: 'cat_finance',
    method: 'SUM',
    weight: 1,
    level: 0,
    customFormula: null,
    lastComputedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('KpiCascadesService category allowlist — list()', () => {
  test('parity: null allowlist returns every edge unchanged', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.allowlist = null; // all / admin
    prisma.store.push(
      makeEdge({ id: 'e1', parentCategoryId: 'cat_finance', childCategoryId: 'cat_finance' }),
      makeEdge({ id: 'e2', parentCategoryId: 'cat_hr', childCategoryId: 'cat_ops' }),
      makeEdge({ id: 'e3', parentCategoryId: null, childCategoryId: null }),
    );
    const result = await withCtx(() => service.list());
    expect(result.map((r) => r.id).sort()).toEqual(['e1', 'e2', 'e3']);
    // Shape parity: no join-only category fields leak into the public payload.
    expect(result[0]).not.toHaveProperty('parentKpi');
    expect(result[0]).not.toHaveProperty('childKpi');
  });

  test('leak closed: edges touching a restricted category are dropped', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.allowlist = ['cat_finance'];
    prisma.store.push(
      // both sides allowed → kept
      makeEdge({ id: 'allowed', parentCategoryId: 'cat_finance', childCategoryId: 'cat_finance' }),
      // child in a restricted category → dropped (no id/name leak)
      makeEdge({ id: 'child_restricted', parentCategoryId: 'cat_finance', childCategoryId: 'cat_secret' }),
      // parent in a restricted category → dropped
      makeEdge({ id: 'parent_restricted', parentCategoryId: 'cat_secret', childCategoryId: 'cat_finance' }),
      // null-category KPI hidden once an allowlist is set
      makeEdge({ id: 'null_cat', parentCategoryId: 'cat_finance', childCategoryId: null }),
    );
    const result = await withCtx(() => service.list());
    expect(result.map((r) => r.id)).toEqual(['allowed']);
  });

  test('empty allowlist hides everything', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.allowlist = [];
    prisma.store.push(makeEdge({ id: 'e1' }), makeEdge({ id: 'e2', parentCategoryId: null }));
    const result = await withCtx(() => service.list());
    expect(result).toEqual([]);
  });
});

describe('KpiCascadesService category allowlist — tree()', () => {
  test('parity: null allowlist builds nodes for every edge', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.allowlist = null;
    prisma.store.push(
      makeEdge({ id: 'e1', parentKpiId: 'p1', parentName: 'P1', childKpiId: 'c1', childName: 'C1' }),
      makeEdge({
        id: 'e2',
        parentKpiId: 'p2',
        parentName: 'P2',
        parentCategoryId: 'cat_hr',
        childKpiId: 'c2',
        childName: 'C2',
        childCategoryId: 'cat_hr',
      }),
    );
    const result = await withCtx(() => service.tree());
    expect(result.map((n) => n.parentKpiId).sort()).toEqual(['p1', 'p2']);
  });

  test('leak closed: restricted parent/child KPI ids + names never appear in the tree', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.allowlist = ['cat_finance'];
    prisma.store.push(
      makeEdge({
        id: 'ok',
        parentKpiId: 'p_ok',
        parentName: 'Allowed Parent',
        childKpiId: 'c_ok',
        childName: 'Allowed Child',
      }),
      makeEdge({
        id: 'leaky',
        parentKpiId: 'p_secret',
        parentName: 'Secret Parent',
        parentCategoryId: 'cat_secret',
        childKpiId: 'c_secret',
        childName: 'Secret Child',
        childCategoryId: 'cat_secret',
      }),
    );
    const result = await withCtx(() => service.tree());

    // Only the allowed edge produced a node.
    expect(result).toHaveLength(1);
    expect(result[0]!.parentKpiId).toBe('p_ok');
    expect(result[0]!.children.map((c) => c.childKpiId)).toEqual(['c_ok']);

    // The restricted KPI ids + names must not surface anywhere in the payload.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('p_secret');
    expect(serialized).not.toContain('Secret Parent');
    expect(serialized).not.toContain('c_secret');
    expect(serialized).not.toContain('Secret Child');
  });
});
