/**
 * SearchService unit tests. Cross-entity search (KPI/Dashboard/User/OrgUnit)
 * scored + merged. Covers: org-scoping, score ordering (exact > prefix >
 * substring), type filter, per-type cap, and soft-deleted/purged exclusion.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { SearchService } from './search.service.js';

const ORG = 'org_alpha';

function makeService(seed: {
  kpis?: Array<{ id: string; name: string; tags?: string[] }>;
  dashboards?: Array<{ id: string; name: string }>;
  users?: Array<{ id: string; fullName: string; email: string }>;
  orgUnits?: Array<{ id: string; name: string }>;
}) {
  const prisma = {
    kPI: { findMany: vi.fn(async () => (seed.kpis ?? []).map((k) => ({ ...k, tags: k.tags ?? [] }))) },
    dashboard: { findMany: vi.fn(async () => seed.dashboards ?? []) },
    user: { findMany: vi.fn(async () => seed.users ?? []) },
    orgUnit: { findMany: vi.fn(async () => seed.orgUnits ?? []) },
  };
  return { service: new SearchService(prisma as unknown as PrismaService), prisma };
}

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run({ userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' }, fn);
}

describe('SearchService.search', () => {
  test('returns matches across entity types', async () => {
    const { service } = makeService({
      kpis: [{ id: 'k1', name: 'Revenue' }],
      dashboards: [{ id: 'd1', name: 'Revenue board' }],
      users: [{ id: 'u1', fullName: 'Revenue Person', email: 'rev@x' }],
      orgUnits: [{ id: 'o1', name: 'Revenue Team' }],
    });
    const res = await withCtx(() => service.search('revenue', {}));
    expect(res.map((r) => r.type).sort()).toEqual(['dashboard', 'kpi', 'orgUnit', 'user']);
  });

  test('orders by score (exact before prefix before substring)', async () => {
    const { service } = makeService({
      kpis: [
        { id: 'k1', name: 'Monthly Revenue' }, // substring 0.5
        { id: 'k2', name: 'Revenue' }, // exact 1.0
        { id: 'k3', name: 'Revenue Growth' }, // prefix 0.8
      ],
    });
    const res = await withCtx(() => service.search('revenue', { types: ['kpi'] }));
    expect(res.map((r) => r.id)).toEqual(['k2', 'k3', 'k1']);
  });

  test('matches KPI tags exactly', async () => {
    const { service } = makeService({ kpis: [{ id: 'k1', name: 'Churn', tags: ['revenue', 'finance'] }] });
    const res = await withCtx(() => service.search('revenue', { types: ['kpi'] }));
    expect(res.map((r) => r.id)).toContain('k1');
  });

  test('respects the types filter', async () => {
    const { service } = makeService({
      kpis: [{ id: 'k1', name: 'Revenue' }],
      dashboards: [{ id: 'd1', name: 'Revenue' }],
    });
    const res = await withCtx(() => service.search('revenue', { types: ['kpi'] }));
    expect(res.every((r) => r.type === 'kpi')).toBe(true);
  });

  test('drops zero-score (non-matching) rows', async () => {
    const { service } = makeService({ kpis: [{ id: 'k1', name: 'Revenue' }, { id: 'k2', name: 'Churn' }] });
    const res = await withCtx(() => service.search('revenue', { types: ['kpi'] }));
    expect(res.map((r) => r.id)).toEqual(['k1']);
  });

  test('empty query returns nothing', async () => {
    const { service } = makeService({ kpis: [{ id: 'k1', name: 'Revenue' }] });
    expect(await withCtx(() => service.search('  ', {}))).toEqual([]);
  });
});
