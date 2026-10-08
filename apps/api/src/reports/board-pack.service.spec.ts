/**
 * BoardPackService (BE-027 / FE-012).
 *
 * Contract: the shape `apps/web/src/lib/api-client.ts` (BoardPack) consumes —
 *   quadrants[{ name, kpis[{ kpiId, name, unit, value, status }], healthDistribution }]
 *   topMovers[{ kpiId, name, unit, previousValue, currentValue, change, changePct }]
 * The old shape (topKpis / latestValue / health) crashed the page.
 *
 * Values: "current" = latest value whose period ended by now, "previous" = latest
 * whose period ended by the window start — both via dashboardSummary (same
 * visibility + data-limit path). The old single windowed call required a period
 * to fit entirely inside the window, so monthly KPIs never showed in a 30-day pack.
 * Status is the row's server-computed status (kpis/kpi-health.ts — tested there).
 */
import { describe, expect, test, vi } from 'vitest';

import type { KpiHealthStatus } from '../kpis/kpi-health.js';
import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { BoardPackService } from './services/board-pack.service.js';

const ORG = 'org_board_pack_test';
type SummaryRow = Awaited<ReturnType<KpiDataService['dashboardSummary']>>[number];

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' };
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

const row = (kpiId: string, latestValue: number | null, extra: Partial<SummaryRow> = {}): SummaryRow => ({
  kpiId,
  name: `KPI ${kpiId}`,
  scope: 'ORG_WIDE',
  unit: null,
  targetValue: null,
  latestValue,
  latestRecordedAt: latestValue === null ? null : new Date(),
  aggregatedValue: latestValue,
  pointCount: latestValue === null ? 0 : 1,
  scorecardQuadrant: null,
  direction: 'HIGHER_IS_BETTER',
  status: (latestValue === null ? 'NO_DATA' : 'NO_TARGET') as KpiHealthStatus,
  attainmentPct: null,
  ...extra,
});

function make(opts: { current: SummaryRow[]; previous?: SummaryRow[]; categories?: Record<string, string> }) {
  const now = Date.now();
  // Route by the `to` bound: a call ending at ~now is "current", earlier is "previous".
  const dashboardSummary = vi.fn(async ({ to }: { from?: Date; to?: Date } = {}) =>
    to && now - to.getTime() > 60_000 ? (opts.previous ?? []) : opts.current,
  );
  const prisma = {
    organization: { findUnique: vi.fn(async () => ({ id: ORG, name: 'Test Org' })) },
    kPI: {
      findMany: vi.fn(async () =>
        opts.current.map((r) => ({
          id: r.kpiId,
          category: opts.categories?.[r.kpiId] ? { name: opts.categories[r.kpiId] } : null,
        })),
      ),
    },
  };
  const service = new BoardPackService(
    { dashboardSummary } as unknown as KpiDataService,
    prisma as unknown as PrismaService,
  );
  return { service, dashboardSummary };
}

describe('BoardPackService', () => {
  test('response matches the web contract (org.id, quadrant.kpis/value/status, healthDistribution)', async () => {
    const { service } = make({
      current: [row('k1', 120, { name: 'Revenue', unit: 'USD', status: 'ON_TRACK' })],
      previous: [row('k1', 100)],
      categories: { k1: 'Financial' },
    });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    expect(r.org).toEqual({ id: ORG, name: 'Test Org' });
    expect(r.quadrants).toEqual([
      {
        name: 'Financial',
        kpis: [{ kpiId: 'k1', name: 'Revenue', unit: 'USD', value: 120, status: 'ON_TRACK' }],
        healthDistribution: { ON_TRACK: 1 },
      },
    ]);
    expect(r.topMovers).toEqual([
      { kpiId: 'k1', name: 'Revenue', unit: 'USD', previousValue: 100, currentValue: 120, change: 20, changePct: 20 },
    ]);
  });

  test('values are "latest ended by now" vs "latest ended by window start" — not points fully inside the window', async () => {
    const { service, dashboardSummary } = make({ current: [row('k1', 5)], previous: [row('k1', 4)] });
    await withCtx(() => service.compose({ sinceDays: 30 }));
    const calls = dashboardSummary.mock.calls.map((c) => c[0] as { from?: Date; to?: Date });
    expect(calls).toHaveLength(2);
    // No lower bound on either call (a lower bound is what excluded monthly periods).
    expect(calls.every((c) => c.from === undefined)).toBe(true);
    const [a, b] = calls.map((c) => c.to!.getTime()).sort((x, y) => y - x);
    expect(Math.round((a! - b!) / 86_400_000)).toBe(30);
  });

  test("uses the row's server-computed status (same rule as the dashboard), problems first", async () => {
    const { service } = make({
      current: [
        row('ok', 200, { status: 'ON_TRACK' }),
        row('risk', 90, { status: 'AT_RISK' }),
        row('bad', 10, { status: 'OFF_TRACK' }),
        row('none', null),
      ],
      categories: { ok: 'Ops', risk: 'Ops', bad: 'Ops', none: 'Ops' },
    });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    const q = r.quadrants[0]!;
    expect(q.kpis.map((k) => `${k.kpiId}:${k.status}`)).toEqual(['bad:OFF_TRACK', 'risk:AT_RISK', 'ok:ON_TRACK', 'none:NO_DATA']);
    expect(q.healthDistribution).toEqual({ OFF_TRACK: 1, AT_RISK: 1, ON_TRACK: 1, NO_DATA: 1 });
  });

  test('top movers: ranked by |% change| (comparable across units), capped at 6, need both values', async () => {
    const current = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => row(`k${i}`, 100 + i * 10));
    const previous = [1, 2, 3, 4, 5, 6, 7].map((i) => row(`k${i}`, 100)); // k8 has no previous
    current.push(row('big', 1_000_100)); // +100 absolute but only +0.01%
    previous.push(row('big', 1_000_000));
    const { service } = make({ current, previous });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    expect(r.topMovers.map((m) => m.kpiId)).toEqual(['k7', 'k6', 'k5', 'k4', 'k3', 'k2']);
  });

  test('uncategorized KPIs are grouped, empty org → empty arrays with period echoed', async () => {
    const one = make({ current: [row('k1', 1)] });
    const r1 = await withCtx(() => one.service.compose({ sinceDays: 30 }));
    expect(r1.quadrants.map((q) => q.name)).toEqual(['Uncategorized']);

    const empty = make({ current: [] });
    const r = await withCtx(() => empty.service.compose({ sinceDays: 7 }));
    expect(r.topMovers).toEqual([]);
    expect(r.quadrants).toEqual([]);
    expect(r.period.sinceDays).toBe(7);
    expect((r.period.to.getTime() - r.period.from.getTime()) / 86_400_000).toBeCloseTo(7, 0);
  });
});
