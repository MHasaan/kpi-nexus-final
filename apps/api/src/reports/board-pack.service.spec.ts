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
 */
import { describe, expect, test, vi } from 'vitest';

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
  ...extra,
});

interface Meta {
  id: string;
  direction?: string;
  targetValue?: number | null;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
  category?: string | null;
}

function make(opts: {
  current: SummaryRow[];
  previous?: SummaryRow[];
  meta?: Meta[];
  bands?: Array<{ kpiId: string; name: string; lower: number | null; upper: number | null; order: number }>;
}) {
  const now = Date.now();
  // Route by the `to` bound: a call ending at ~now is "current", earlier is "previous".
  const dashboardSummary = vi.fn(async ({ to }: { from?: Date; to?: Date } = {}) =>
    to && now - to.getTime() > 60_000 ? (opts.previous ?? []) : opts.current,
  );
  const prisma = {
    organization: { findUnique: vi.fn(async () => ({ id: ORG, name: 'Test Org' })) },
    kPI: {
      findMany: vi.fn(async () =>
        (opts.meta ?? opts.current.map((r): Meta => ({ id: r.kpiId }))).map((m) => ({
          id: m.id,
          direction: m.direction ?? 'HIGHER_IS_BETTER',
          targetValue: m.targetValue ?? null,
          warningThreshold: m.warningThreshold ?? null,
          criticalThreshold: m.criticalThreshold ?? null,
          category: m.category ? { name: m.category } : null,
        })),
      ),
    },
    kPIThresholdBand: {
      findMany: vi.fn(async () =>
        (opts.bands ?? []).map((b) => ({ ...b, color: '#000', consecutivePointsRequired: 1 })),
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
      current: [row('k1', 120, { name: 'Revenue', unit: 'USD' })],
      previous: [row('k1', 100)],
      meta: [{ id: 'k1', targetValue: 100, category: 'Financial' }],
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

  test('status is direction-aware: a LOWER_IS_BETTER KPI over target is not on track', async () => {
    const { service } = make({
      current: [row('churn', 3.6), row('cost', 90)],
      meta: [
        { id: 'churn', direction: 'LOWER_IS_BETTER', targetValue: 2.5, category: 'Financial' },
        { id: 'cost', direction: 'LOWER_IS_BETTER', targetValue: 100, category: 'Financial' },
      ],
    });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    const byId = Object.fromEntries(r.quadrants[0]!.kpis.map((k) => [k.kpiId, k.status]));
    expect(byId).toEqual({ churn: 'AT_RISK', cost: 'ON_TRACK' });
  });

  test('threshold bands win over the target rule (band name → status)', async () => {
    const { service } = make({
      current: [row('nps', 30)],
      meta: [{ id: 'nps', targetValue: 10, category: 'Customer' }],
      bands: [
        { kpiId: 'nps', name: 'On Track', lower: 50, upper: null, order: 0 },
        { kpiId: 'nps', name: 'Off Track', lower: null, upper: 49.99, order: 1 },
      ],
    });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    expect(r.quadrants[0]!.kpis[0]!.status).toBe('OFF_TRACK');
  });

  test('no value → NO_DATA; problems are listed first within a quadrant', async () => {
    const { service } = make({
      current: [row('ok', 200), row('bad', 10), row('none', null)],
      meta: [
        { id: 'ok', targetValue: 100, category: 'Ops' },
        { id: 'bad', targetValue: 100, category: 'Ops' },
        { id: 'none', targetValue: 100, category: 'Ops' },
      ],
    });
    const r = await withCtx(() => service.compose({ sinceDays: 30 }));
    const q = r.quadrants[0]!;
    expect(q.kpis.map((k) => `${k.kpiId}:${k.status}`)).toEqual(['bad:OFF_TRACK', 'ok:ON_TRACK', 'none:NO_DATA']);
    expect(q.healthDistribution).toEqual({ OFF_TRACK: 1, ON_TRACK: 1, NO_DATA: 1 });
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

  test('empty org → empty arrays, period echoed', async () => {
    const { service } = make({ current: [] });
    const r = await withCtx(() => service.compose({ sinceDays: 7 }));
    expect(r.topMovers).toEqual([]);
    expect(r.quadrants).toEqual([]);
    expect(r.period.sinceDays).toBe(7);
    expect((r.period.to.getTime() - r.period.from.getTime()) / 86_400_000).toBeCloseTo(7, 0);
  });
});
