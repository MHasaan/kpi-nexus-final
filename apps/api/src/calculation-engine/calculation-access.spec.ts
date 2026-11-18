/**
 * BE-052: "recompute now" and "roll up now" work a KPI's value out from other
 * KPIs' values and hand the result back. They asked only for KPI_EDIT — not
 * whether the caller may see the KPI, nor whether they may read the values
 * that go into it.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { CalculationAccessService } from './calculation-access.service.js';

function make(opts: { visible?: boolean; childScopes?: string[]; sourceScopes?: string[]; restricted?: string[] }) {
  const prisma = {
    kPICascade: { findMany: vi.fn(async () => (opts.childScopes ?? []).map((scope) => ({ childKpi: { scope } }))) },
    kPIDependency: { findMany: vi.fn(async () => (opts.sourceScopes ?? []).map((_, i) => ({ sourceKpiId: `src${i}` }))) },
    kPI: { findMany: vi.fn(async () => (opts.sourceScopes ?? []).map((scope) => ({ scope }))) },
  };
  const access = {
    isKpiVisible: vi.fn(async () => opts.visible ?? true),
    // A restricted caller reads only some rows of these kinds of KPI.
    kpiPointScopeWhere: vi.fn(async (scope: string) => ((opts.restricted ?? []).includes(scope) ? { userId: { in: ['me'] } } : {})),
  };
  const service = new CalculationAccessService(prisma as unknown as PrismaService, access as unknown as AccessContextService);
  const run = () => RequestContextStore.run({ userId: 'me', organizationId: 'org-a', roleId: null, principalType: 'user' }, () => service.assertMayTrigger('kpi-1')) as Promise<void>;
  return { run, access };
}

describe('CalculationAccessService.assertMayTrigger', () => {
  test('a KPI the caller cannot see is not found', async () => {
    await expect(make({ visible: false }).run()).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  test('someone who can read every value that goes into the KPI may trigger it', async () => {
    await expect(make({ childScopes: ['PER_USER', 'ORG_WIDE'], sourceScopes: ['PER_UNIT'] }).run()).resolves.toBeUndefined();
  });

  test('a roll-up over per-person children is refused to someone who reads only their own values', async () => {
    await expect(make({ childScopes: ['PER_USER'], restricted: ['PER_USER'] }).run()).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  test('a formula over a per-unit source is refused to someone who reads only their units', async () => {
    await expect(make({ sourceScopes: ['PER_UNIT'], restricted: ['PER_UNIT'] }).run()).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  test('the same person may trigger a KPI built only from organisation-wide values', async () => {
    await expect(make({ childScopes: ['ORG_WIDE'], restricted: ['PER_USER', 'PER_UNIT'] }).run()).resolves.toBeUndefined();
  });
});
