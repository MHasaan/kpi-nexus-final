/**
 * P3.6 — BoardPackService unit tests.
 *
 * Pure unit. KpiDataService.dashboardSummary is mocked; PrismaService faked.
 * Tests cover:
 *   - topMovers are sorted by |change| descending and capped at 6
 *   - empty dashboardSummary → empty arrays, no throw
 *   - quadrants group KPIs by category
 */

import { describe, expect, test, vi } from 'vitest';

import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { BoardPackService } from './services/board-pack.service.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const ORG = 'org_board_pack_test';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  const full: RequestContext = {
    userId: ctx.userId ?? 'u1',
    organizationId: ctx.organizationId ?? ORG,
    roleId: ctx.roleId ?? null,
    principalType: ctx.principalType ?? 'user',
  };
  return RequestContextStore.run(full, fn);
}

type DashboardSummaryRow = Awaited<ReturnType<import('../kpis/kpi-data.service.js').KpiDataService['dashboardSummary']>>[number];

// ──────────────────────────────────────────────────────────────────────────────
// Fakes
// ──────────────────────────────────────────────────────────────────────────────

class FakeKpiDataService {
  summaryRows: DashboardSummaryRow[] = [];

  async dashboardSummary(_opts: { from?: Date; to?: Date } = {}): Promise<DashboardSummaryRow[]> {
    return this.summaryRows;
  }
}

interface FakeKpiMeta {
  id: string;
  organizationId: string;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: string;
  targetValue: number | null;
  deletedAt: null;
  category: { name: string } | null;
}

class FakePrisma {
  orgStore: Array<{ id: string; name: string }> = [{ id: ORG, name: 'Test Org' }];
  kpiStore: FakeKpiMeta[] = [];

  organization = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return this.orgStore.find((o) => o.id === where.id) ?? null;
    }),
  };

  kPI = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; organizationId: string } }) => {
      return this.kpiStore.filter(
        (k) => where.id.in.includes(k.id) && k.organizationId === where.organizationId,
      );
    }),
  };
}

function makeService(prisma: FakePrisma, kpiData: FakeKpiDataService) {
  return new BoardPackService(
    kpiData as unknown as import('../kpis/kpi-data.service.js').KpiDataService,
    prisma as unknown as import('../prisma/prisma.service.js').PrismaService,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('BoardPackService', () => {
  test('empty dashboardSummary → empty arrays, no throw', async () => {
    const prisma = new FakePrisma();
    const kpiData = new FakeKpiDataService();
    const service = makeService(prisma, kpiData);

    const result = await withCtx({}, () => service.compose({ sinceDays: 30 }));
    expect(result.topMovers).toEqual([]);
    expect(result.quadrants).toEqual([]);
    expect(result.org.name).toBe('Test Org');
  });

  test('topMovers sorted by |change| descending, capped at 6', async () => {
    const prisma = new FakePrisma();
    const kpiData = new FakeKpiDataService();

    // 8 KPIs with varying changes. latestValue - aggregatedValue = change.
    for (let i = 1; i <= 8; i++) {
      const latest = i * 10;
      const aggregated = 10; // change = latest - 10
      kpiData.summaryRows.push({
        kpiId: `kpi_${i}`,
        name: `KPI ${i}`,
        scope: 'ORG_WIDE',
        unit: null,
        targetValue: null,
        latestValue: latest,
        latestRecordedAt: new Date(),
        aggregatedValue: aggregated,
        pointCount: 5,
      });
      prisma.kpiStore.push({
        id: `kpi_${i}`,
        organizationId: ORG,
        warningThreshold: null,
        criticalThreshold: null,
        direction: 'HIGHER_IS_BETTER',
        targetValue: null,
        deletedAt: null,
        category: null,
      });
    }

    const service = makeService(prisma, kpiData);
    const result = await withCtx({}, () => service.compose({ sinceDays: 30 }));

    // Should return only 6 movers.
    expect(result.topMovers).toHaveLength(6);

    // First mover should have the largest absolute change.
    // kpi_8 has change = 80 - 10 = 70 (largest).
    expect(result.topMovers[0]!.kpiId).toBe('kpi_8');

    // All 6 should have change (non-null).
    for (const mover of result.topMovers) {
      expect(mover.change).not.toBeNull();
    }
  });

  test('quadrants group KPIs by category name', async () => {
    const prisma = new FakePrisma();
    const kpiData = new FakeKpiDataService();

    kpiData.summaryRows.push(
      {
        kpiId: 'kpi_fin_1',
        name: 'Revenue',
        scope: 'ORG_WIDE',
        unit: 'USD',
        targetValue: 1000,
        latestValue: 900,
        latestRecordedAt: new Date(),
        aggregatedValue: 800,
        pointCount: 3,
      },
      {
        kpiId: 'kpi_cust_1',
        name: 'NPS',
        scope: 'ORG_WIDE',
        unit: null,
        targetValue: 70,
        latestValue: 65,
        latestRecordedAt: new Date(),
        aggregatedValue: 60,
        pointCount: 2,
      },
    );

    prisma.kpiStore.push(
      {
        id: 'kpi_fin_1',
        organizationId: ORG,
        warningThreshold: null,
        criticalThreshold: null,
        direction: 'HIGHER_IS_BETTER',
        targetValue: 1000,
        deletedAt: null,
        category: { name: 'Financial' },
      },
      {
        id: 'kpi_cust_1',
        organizationId: ORG,
        warningThreshold: null,
        criticalThreshold: null,
        direction: 'HIGHER_IS_BETTER',
        targetValue: 70,
        deletedAt: null,
        category: { name: 'Customer' },
      },
    );

    const service = makeService(prisma, kpiData);
    const result = await withCtx({}, () => service.compose({ sinceDays: 30 }));

    expect(result.quadrants).toHaveLength(2);
    const names = result.quadrants.map((q) => q.name).sort();
    expect(names).toEqual(['Customer', 'Financial']);

    const fin = result.quadrants.find((q) => q.name === 'Financial')!;
    expect(fin.topKpis).toHaveLength(1);
    expect(fin.topKpis[0]!.kpiId).toBe('kpi_fin_1');
  });

  test('period object contains from + to + sinceDays', async () => {
    const prisma = new FakePrisma();
    const kpiData = new FakeKpiDataService();
    const service = makeService(prisma, kpiData);

    const result = await withCtx({}, () => service.compose({ sinceDays: 7 }));
    expect(result.period.sinceDays).toBe(7);
    expect(result.period.from).toBeInstanceOf(Date);
    expect(result.period.to).toBeInstanceOf(Date);
    const diffDays = (result.period.to.getTime() - result.period.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
