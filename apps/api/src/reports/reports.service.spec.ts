/**
 * Phase 4 (Layer-4 data limits) — ReportsService.buildDataset export-row cap.
 *
 * Focused unit. Prisma / KpiDataService / AccessContextService are in-memory
 * fakes. The KPI visibility + scope logic lives in KpiDataService (covered by
 * its own suite); here we only assert the maxExportRows cap on the assembled
 * dataset:
 *
 *   - maxExportRows = N caps the TOTAL data points across all KPIs to N (and
 *     fills KPIs in order, later ones emptied once the budget is exhausted).
 *   - maxExportRows = null ⇒ every point survives (parity / admin).
 *
 * Tenancy (organizationId) is preserved — buildDataset reads it from the
 * RequestContextStore via the org lookup, which the fake honours.
 */
import { describe, expect, test, vi } from 'vitest';

import type { KpiDataService, PublicDataPoint } from '../kpis/kpi-data.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { ReportsService } from './reports.service.js';

const ORG = 'org_alpha';

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: ORG,
    roleId: null,
    principalType: 'user',
  };
  return RequestContextStore.run(ctx, fn);
}

/** A KPI's summary row + how many data points it should yield from listForKpi. */
interface KpiFixture {
  kpiId: string;
  name: string;
  unit: string | null;
  pointCount: number;
}

function makeService(fixtures: KpiFixture[], maxExportRows: number | null) {
  // ── Prisma fake — only organization.findUnique is exercised by buildDataset
  //    when no dashboardId/kpiIds are given (all-visible path). ─────────────
  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        // Defends tenancy: only the in-context org resolves a name.
        return where.id === ORG ? { name: 'Alpha Inc' } : null;
      }),
    },
  };

  // ── KpiDataService fake — dashboardSummary lists the visible KPIs and
  //    listForKpi returns `pointCount` synthetic points for each. ───────────
  const summary = fixtures.map((f) => ({
    kpiId: f.kpiId,
    name: f.name,
    scope: 'ORG_WIDE' as const,
    unit: f.unit,
    targetValue: null,
    latestValue: f.pointCount > 0 ? f.pointCount : null,
    latestRecordedAt: null,
    aggregatedValue: null,
    pointCount: f.pointCount,
    scorecardQuadrant: null,
  }));
  const byId = new Map(fixtures.map((f) => [f.kpiId, f]));
  const listForKpi = vi.fn(async (kpiId: string): Promise<PublicDataPoint[]> => {
    const f = byId.get(kpiId);
    if (!f) return [];
    return Array.from({ length: f.pointCount }, (_, i) => ({
      value: i,
      recordedAt: new Date(2026, 0, 1, 0, 0, i),
    })) as unknown as PublicDataPoint[];
  });
  const kpiData = {
    dashboardSummary: vi.fn(async () => summary),
    listForKpi,
  };

  // ── AccessContextService fake — only dataLimits() matters here. ──────────
  const accessContext = {
    dataLimits: vi.fn(async () => ({
      historyWindowDays: null,
      maxListRows: null,
      maxExportRows,
    })),
  };

  const service = new ReportsService(
    kpiData as unknown as KpiDataService,
    prisma as unknown as PrismaService,
    accessContext as unknown as AccessContextService,
  );
  return { service, listForKpi };
}

function totalPoints(dataset: { kpis: Array<{ points: unknown[] }> }): number {
  return dataset.kpis.reduce((sum, k) => sum + k.points.length, 0);
}

describe('ReportsService.buildDataset — Layer-4 maxExportRows cap', () => {
  const FIXTURES: KpiFixture[] = [
    { kpiId: 'kpi_1', name: 'Revenue', unit: 'USD', pointCount: 6 },
    { kpiId: 'kpi_2', name: 'NPS', unit: null, pointCount: 6 },
    { kpiId: 'kpi_3', name: 'Churn', unit: '%', pointCount: 6 },
  ];

  test('null maxExportRows ⇒ every data point survives (parity)', async () => {
    const { service } = makeService(FIXTURES, null);
    const dataset = await withCtx(() => service.buildDataset({}));

    expect(dataset.orgName).toBe('Alpha Inc');
    expect(dataset.kpis).toHaveLength(3);
    // 6 + 6 + 6 = 18 points, none trimmed.
    expect(totalPoints(dataset)).toBe(18);
    expect(dataset.kpis.map((k) => k.points.length)).toEqual([6, 6, 6]);
  });

  test('maxExportRows = N caps the TOTAL across all KPIs to N', async () => {
    const { service } = makeService(FIXTURES, 10);
    const dataset = await withCtx(() => service.buildDataset({}));

    // 18 available, capped to 10.
    expect(totalPoints(dataset)).toBe(10);
    // Filled in order: kpi_1 keeps 6, kpi_2 takes the remaining 4, kpi_3 emptied.
    expect(dataset.kpis.map((k) => k.points.length)).toEqual([6, 4, 0]);
    // KPI rows themselves are preserved even when their points are trimmed away.
    expect(dataset.kpis).toHaveLength(3);
  });

  test('maxExportRows ≥ total ⇒ no trimming', async () => {
    const { service } = makeService(FIXTURES, 100);
    const dataset = await withCtx(() => service.buildDataset({}));
    expect(totalPoints(dataset)).toBe(18);
  });

  test('maxExportRows = 0 ⇒ all points trimmed, KPI rows kept', async () => {
    const { service } = makeService(FIXTURES, 0);
    const dataset = await withCtx(() => service.buildDataset({}));
    expect(totalPoints(dataset)).toBe(0);
    expect(dataset.kpis).toHaveLength(3);
  });
});
