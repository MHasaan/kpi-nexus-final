/**
 * InsightsService unit tests for the dismiss lifecycle + list filtering.
 * In-memory Prisma fake for kPIInsight (findFirst/update/findMany); AI router
 * and configs are unused by these paths so they're stubbed. Covers: dismiss
 * sets status/dismissedAt/dismissedById and is org-scoped (cross-tenant 404),
 * and list hides DISMISSED rows by default but surfaces them on opt-in.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AiConfigsService } from '../ai/ai-configs.service.js';
import type { AiRouterService } from '../ai/ai-router.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { InsightsService } from './insights.service.js';

interface FakeInsight {
  id: string;
  organizationId: string;
  kpiId: string;
  narrative: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  confidence: number;
  generatedAt: Date;
  status: string;
  dismissedAt: Date | null;
  dismissedById: string | null;
}

class FakePrisma {
  insights: FakeInsight[] = [];
  // KPI rows and their data-point values (oldest→newest) keyed by kpiId.
  kpis: Array<{
    id: string;
    organizationId: string;
    name: string;
    deletedAt: Date | null;
    unit: string | null;
    direction: string;
    frequency: string;
    targetValue: number | null;
    warningThreshold: number | null;
    criticalThreshold: number | null;
  }> = [];
  dataPoints: Record<string, number[]> = {};
  // Each value's period start (YYYY-MM-DD), oldest→newest; monthly from January 2026 unless given.
  periods: Record<string, string[]> = {};
  private insightSeq = 0;

  /** Both writes or neither, as Prisma's array form does. */
  $transaction = vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations));

  kPI = {
    findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
      this.kpis.filter((k) => k.organizationId === where.organizationId && k.deletedAt === null).map((k) => ({ id: k.id })),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = this.kpis.find(
        (k) =>
          k.id === where.id &&
          k.organizationId === where.organizationId &&
          k.deletedAt === (where.deletedAt as Date | null),
      );
      return row
        ? {
            id: row.id,
            name: row.name,
            unit: row.unit,
            direction: row.direction,
            frequency: row.frequency,
            targetValue: row.targetValue,
            warningThreshold: row.warningThreshold,
            criticalThreshold: row.criticalThreshold,
          }
        : null;
    }),
  };

  kPIDataPoint = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      // Service stores oldest→newest, queries desc then reverses; emulate desc here.
      const values = this.dataPoints[where.kpiId as string] ?? [];
      const periods = this.periods[where.kpiId as string];
      return values
        .map((value, i) => ({ value, periodStart: periods?.[i] ? new Date(`${periods[i]}T00:00:00Z`) : new Date(Date.UTC(2026, i, 1)) }))
        .reverse();
    }),
  };

  kPIInsight = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = this.insights.find(
        (i) => i.id === where.id && i.organizationId === where.organizationId,
      );
      return row ? { ...row } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const status = where.status as string | { not?: string } | undefined;
      return this.insights
        .filter((i) => i.organizationId === where.organizationId)
        .filter((i) => (status === undefined ? true : typeof status === 'string' ? i.status === status : i.status !== status.not))
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
        .filter((i) => {
          const k = where.kpiId as string | { in: string[] } | undefined;
          return k === undefined ? true : typeof k === 'string' ? i.kpiId === k : k.in.includes(i.kpiId);
        })
        .map((i) => ({ ...i }));
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeInsight> }) => {
      const rows = this.insights.filter((i) => i.organizationId === where.organizationId && i.kpiId === where.kpiId && i.status === where.status);
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: FakeInsight = {
        id: `ins_created_${++this.insightSeq}`,
        narrative: '',
        model: '',
        promptTokens: 0,
        completionTokens: 0,
        confidence: 0.5,
        generatedAt: new Date(),
        status: 'ACTIVE',
        dismissedAt: null,
        dismissedById: null,
        ...(data as Partial<FakeInsight>),
      } as FakeInsight;
      this.insights.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.insights.find((i) => i.id === where.id)!;
      for (const k of Object.keys(data)) (row as unknown as Record<string, unknown>)[k] = data[k];
      return { ...row };
    }),
  };

  seedKpi(
    id: string,
    organizationId: string,
    values: number[],
    name = 'KPI',
    extra: Partial<{
      unit: string | null;
      direction: string;
      frequency: string;
      periods: string[];
      targetValue: number | null;
      warningThreshold: number | null;
      criticalThreshold: number | null;
    }> = {},
  ): void {
    this.kpis.push({
      id,
      organizationId,
      name,
      deletedAt: null,
      unit: extra.unit ?? null,
      direction: extra.direction ?? 'HIGHER_IS_BETTER',
      frequency: extra.frequency ?? 'MONTHLY',
      targetValue: extra.targetValue ?? null,
      warningThreshold: extra.warningThreshold ?? null,
      criticalThreshold: extra.criticalThreshold ?? null,
    });
    this.dataPoints[id] = values;
    if (extra.periods) this.periods[id] = extra.periods;
  }

  seed(partial: Partial<FakeInsight> & { id: string; organizationId: string }): FakeInsight {
    const row: FakeInsight = {
      kpiId: 'kpi_1',
      narrative: 'n',
      model: 'm',
      promptTokens: 0,
      completionTokens: 0,
      confidence: 0.5,
      generatedAt: new Date(),
      status: 'ACTIVE',
      dismissedAt: null,
      dismissedById: null,
      ...partial,
    };
    this.insights.push(row);
    return row;
  }
}

const ORG = 'org_alpha';
const USER = 'user_1';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    {
      userId: ctx.userId ?? USER,
      organizationId: ctx.organizationId ?? ORG,
      roleId: null,
      principalType: 'user',
    },
    fn,
  );
}

/** Pull the user-message string out of the last aiRouter.complete(...) call. */
function lastUserMessage(aiRouter: AiRouterService): string {
  const mock = (aiRouter.complete as unknown as { mock: { calls: unknown[][] } }).mock;
  const lastCall = mock.calls[mock.calls.length - 1]!;
  const opts = lastCall[1] as { messages: Array<{ role: string; content: string }> };
  return opts.messages.find((m) => m.role === 'user')!.content;
}

/** The system prompt of the last aiRouter.complete(...) call. */
function lastSystemPrompt(aiRouter: AiRouterService): string {
  const mock = (aiRouter.complete as unknown as { mock: { calls: unknown[][] } }).mock;
  return (mock.calls[mock.calls.length - 1]![1] as { systemPrompt: string }).systemPrompt;
}

/** visibleKpiIds: null = sees every KPI (admin / parity); an array = the caller's visible KPIs. */
function makeService(visibleKpiIds: string[] | null = null) {
  const prisma = new FakePrisma();
  // Deterministic AI stubs so generate() can run without a real provider.
  const aiRouter = {
    complete: vi.fn(async () => ({
      content: 'narrative',
      usage: { inputTokens: 1, outputTokens: 2 },
    })),
  } as unknown as AiRouterService;
  const configs = {
    resolve: vi.fn(async () => ({ model: 'test-model' })),
  } as unknown as AiConfigsService;
  const accessContext = {
    visibleKpiIds: vi.fn(async () => visibleKpiIds),
    isKpiVisible: vi.fn(async (id: string) => visibleKpiIds === null || visibleKpiIds.includes(id)),
  } as unknown as AccessContextService;
  const service = new InsightsService(prisma as unknown as PrismaService, aiRouter, configs, accessContext);
  return { service, prisma, aiRouter };
}

describe('InsightsService.dismiss', () => {
  test('sets status/dismissedAt/dismissedById on the org-scoped insight', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'ins_1', organizationId: ORG });

    const updated = await withCtx({ userId: USER }, () => service.dismiss('ins_1'));

    expect(updated.status).toBe('DISMISSED');
    expect(updated.dismissedById).toBe(USER);
    expect(updated.dismissedAt).toBeInstanceOf(Date);
    expect(prisma.kPIInsight.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ins_1' } }),
    );
  });

  test('404 when the insight belongs to another tenant', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'ins_other', organizationId: 'org_beta' });

    await expect(
      withCtx({ organizationId: ORG }, () => service.dismiss('ins_other')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.kPIInsight.update).not.toHaveBeenCalled();
  });

  test('404 when the insight does not exist', async () => {
    const { service } = makeService();
    await expect(withCtx({}, () => service.dismiss('missing'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InsightsService.list', () => {
  test('excludes DISMISSED insights by default', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'active_1', organizationId: ORG, status: 'ACTIVE' });
    prisma.seed({ id: 'dismissed_1', organizationId: ORG, status: 'DISMISSED' });

    const rows = await withCtx({}, () => service.list({}));

    expect(rows.map((r) => r.id)).toEqual(['active_1']);
  });

  test('includes DISMISSED insights when includeDismissed is true', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'active_1', organizationId: ORG, status: 'ACTIVE' });
    prisma.seed({ id: 'dismissed_1', organizationId: ORG, status: 'DISMISSED' });

    const rows = await withCtx({}, () => service.list({ includeDismissed: true }));

    expect(rows.map((r) => r.id).sort()).toEqual(['active_1', 'dismissed_1']);
  });
});

// QA-M6 (plan 4.8): every "Generate" added a row and nothing retired the old
// ones — 52 insights for 22 KPIs, up to five near-identical per KPI.
describe('InsightsService — one current insight per KPI', () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

  test('generating again replaces the KPI\'s current insight; the old one is kept as history', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_r', ORG, [100, 120]);

    const first = await withCtx({}, () => service.generate('kpi_r'));
    const second = await withCtx({}, () => service.generate('kpi_r'));

    const listed = await withCtx({}, () => service.list({}));
    expect(listed.map((r) => r.id)).toEqual([second!.id]);
    expect(prisma.insights.find((i) => i.id === first!.id)!.status).toBe('SUPERSEDED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2); // retire + create go together
  });

  test('another KPI\'s insight is left alone, and so is a dismissed one', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_a', ORG, [100, 120]);
    prisma.seed({ id: 'other_kpi', organizationId: ORG, kpiId: 'kpi_b', status: 'ACTIVE' });
    prisma.seed({ id: 'dismissed', organizationId: ORG, kpiId: 'kpi_a', status: 'DISMISSED' });

    await withCtx({}, () => service.generate('kpi_a'));

    expect(prisma.insights.find((i) => i.id === 'other_kpi')!.status).toBe('ACTIVE');
    expect(prisma.insights.find((i) => i.id === 'dismissed')!.status).toBe('DISMISSED');
  });

  test('duplicates made before this rule are shown once: the newest per KPI', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'a_old', organizationId: ORG, kpiId: 'kpi_a', status: 'ACTIVE', generatedAt: at(30) });
    prisma.seed({ id: 'a_new', organizationId: ORG, kpiId: 'kpi_a', status: 'ACTIVE', generatedAt: at(1) });
    prisma.seed({ id: 'a_mid', organizationId: ORG, kpiId: 'kpi_a', status: 'ACTIVE', generatedAt: at(10) });
    prisma.seed({ id: 'b_only', organizationId: ORG, kpiId: 'kpi_b', status: 'ACTIVE', generatedAt: at(5) });

    const listed = await withCtx({}, () => service.list({}));

    expect(listed.map((r) => r.id)).toEqual(['a_new', 'b_only']);
  });

  test('the history view still returns everything, newest first', async () => {
    const { service, prisma } = makeService();
    prisma.seed({ id: 'old', organizationId: ORG, kpiId: 'kpi_a', status: 'SUPERSEDED', generatedAt: at(30) });
    prisma.seed({ id: 'current', organizationId: ORG, kpiId: 'kpi_a', status: 'ACTIVE', generatedAt: at(1) });
    prisma.seed({ id: 'gone', organizationId: ORG, kpiId: 'kpi_a', status: 'DISMISSED', generatedAt: at(10) });

    const listed = await withCtx({}, () => service.list({ kpiId: 'kpi_a', includeDismissed: true }));

    expect(listed.map((r) => r.id)).toEqual(['current', 'gone', 'old']);
  });

  test('a failed generation retires nothing', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_f', ORG, [100, 120]);
    prisma.seed({ id: 'keeps', organizationId: ORG, kpiId: 'kpi_f', status: 'ACTIVE' });
    vi.mocked(aiRouter.complete).mockRejectedValueOnce(new Error('provider down'));

    await expect(withCtx({}, () => service.generate('kpi_f'))).rejects.toThrow('provider down');

    expect(prisma.insights.find((i) => i.id === 'keeps')!.status).toBe('ACTIVE');
  });
});

describe('InsightsService.generate confidence', () => {
  test('persists a confidence within [0, 1]', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_c1', ORG, [100, 101]);

    const insight = await withCtx({}, () => service.generate('kpi_c1'));

    expect(insight).not.toBeNull();
    expect(insight!.confidence).toBeGreaterThanOrEqual(0);
    expect(insight!.confidence).toBeLessThanOrEqual(1);
    // Recent values = newest periods, not newest entries (AN-002).
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0]).toMatchObject({ orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }] });
    // Organisation-level rows only (BE-054): what is written is stored and read by others, so it is
    // never built from one person's or one unit's values.
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0]).toMatchObject({ where: { userId: null, orgUnitId: null } });
  });

  test('rises with more data points (higher volume → higher confidence)', async () => {
    const { service, prisma } = makeService();
    // Same tiny change, but more points → more volume → higher confidence.
    prisma.seedKpi('kpi_few', ORG, [100, 100]);
    prisma.seedKpi('kpi_many', ORG, Array.from({ length: 12 }, () => 100));

    const few = await withCtx({}, () => service.generate('kpi_few'));
    const many = await withCtx({}, () => service.generate('kpi_many'));

    expect(many!.confidence).toBeGreaterThan(few!.confidence);
  });

  test('rises with a larger change magnitude (|change| > 50%)', async () => {
    const { service, prisma } = makeService();
    // Same point count; only the change magnitude differs.
    prisma.seedKpi('kpi_small', ORG, [100, 110]); // +10%
    prisma.seedKpi('kpi_big', ORG, [100, 200]); // +100% → magnitude bonus

    const small = await withCtx({}, () => service.generate('kpi_small'));
    const big = await withCtx({}, () => service.generate('kpi_big'));

    expect(big!.confidence).toBeGreaterThan(small!.confidence);
  });

  test('caps confidence at 1 for high volume + large change', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_max', ORG, [100, ...Array.from({ length: 20 }, () => 1000)]); // many points, huge change

    const insight = await withCtx({}, () => service.generate('kpi_max'));

    expect(insight!.confidence).toBe(1);
  });
});

describe('InsightsService.generate enriched grounding', () => {
  test('prompt includes unit, direction, target, status, and thresholds', async () => {
    const { service, prisma, aiRouter } = makeService();
    // HIGHER_IS_BETTER, latest 80 below target 100 → "below target".
    prisma.seedKpi('kpi_g', ORG, [50, 80], 'Revenue', {
      unit: 'USD',
      direction: 'HIGHER_IS_BETTER',
      targetValue: 100,
      warningThreshold: 70,
      criticalThreshold: 40,
    });

    await withCtx({}, () => service.generate('kpi_g'));

    const msg = lastUserMessage(aiRouter);
    expect(msg).toContain('Revenue (USD)');
    expect(msg).toContain('direction: HIGHER_IS_BETTER');
    expect(msg).toContain('Target: 100');
    expect(msg).toContain('below target');
    expect(msg).toContain('warning 70');
    expect(msg).toContain('critical 40');
  });

  test('marks the latest value on target when it meets the target', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_on', ORG, [90, 120], 'Signups', {
      direction: 'HIGHER_IS_BETTER',
      targetValue: 100,
    });

    await withCtx({}, () => service.generate('kpi_on'));

    const msg = lastUserMessage(aiRouter);
    expect(msg).toContain('Target: 100');
    expect(msg).toContain('on target');
  });

  test('omits target/threshold lines when the KPI has none', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_bare', ORG, [10, 11], 'Bare');

    await withCtx({}, () => service.generate('kpi_bare'));

    const msg = lastUserMessage(aiRouter);
    expect(msg).not.toContain('Target:');
    expect(msg).not.toContain('Thresholds:');
  });

  // Tried with Gemini on 2026-11-20: a monthly KPI's insight said "over the 12-period window". The
  // prompt counted the values but gave no dates, so the narrative could not say when anything happened.
  test('says which dates the values cover and how often the KPI is recorded', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_span', ORG, [1180, 1300, 1420], 'CAC', {
      frequency: 'MONTHLY',
      periods: ['2026-09-01', '2026-10-01', '2026-11-01'],
    });

    await withCtx({}, () => service.generate('kpi_span'));

    expect(lastUserMessage(aiRouter)).toContain('Period: from 2026-09-01 to 2026-11-01, recorded monthly.');
    // …and the narrative is asked to say when from it, not to count periods.
    expect(lastSystemPrompt(aiRouter)).toContain('Period line');
    expect(lastSystemPrompt(aiRouter)).not.toContain('window');
  });

  test('values that all belong to one period name that one date', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_one_day', ORG, [40, 44], 'Tickets', {
      frequency: 'DAILY',
      periods: ['2026-11-19', '2026-11-19'],
    });

    await withCtx({}, () => service.generate('kpi_one_day'));

    expect(lastUserMessage(aiRouter)).toContain('Period: 2026-11-19, recorded daily.');
  });
});

// BE-004: everyone saw every insight, including insights about KPIs they can't
// see. Insights now follow the KPI's visibility (same rule as GET /kpis).
describe('InsightsService — only insights about KPIs the caller can see (BE-004)', () => {
  test('list hides insights on invisible KPIs; an explicit kpiId filter cannot bypass it', async () => {
    const { service, prisma } = makeService(['k_visible']);
    prisma.seed({ id: 'ins_ok', organizationId: ORG, kpiId: 'k_visible' });
    prisma.seed({ id: 'ins_hidden', organizationId: ORG, kpiId: 'k_hidden' });

    expect((await withCtx({}, () => service.list({}))).map((r) => r.id)).toEqual(['ins_ok']);
    expect(await withCtx({}, () => service.list({ kpiId: 'k_hidden' }))).toEqual([]);
  });

  test('admin / unrestricted (null) sees all', async () => {
    const { service, prisma } = makeService(null);
    prisma.seed({ id: 'a', organizationId: ORG, kpiId: 'k1' });
    prisma.seed({ id: 'b', organizationId: ORG, kpiId: 'k2' });
    expect((await withCtx({}, () => service.list({}))).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  test('dismiss of an insight on an invisible KPI → 404', async () => {
    const { service, prisma } = makeService(['k_visible']);
    prisma.seed({ id: 'ins_hidden', organizationId: ORG, kpiId: 'k_hidden' });
    await expect(withCtx({}, () => service.dismiss('ins_hidden'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

// Manual QA (2026-11-19, F-042): "Generate insights" did nothing and said nothing. The batch found no KPI
// worth an insight (too few values, or too little change) and returned an empty list; the page showed "No
// insights yet" as before. The batch now says what it skipped and why, so the page can.
describe('InsightsService.generateBatch — what was skipped, and why', () => {
  test('counts the KPIs with too few values and the ones that changed too little', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_one', ORG, [100], 'One value');
    prisma.seedKpi('kpi_flat', ORG, [100, 101], 'Barely moved');
    prisma.seedKpi('kpi_big', ORG, [100, 150], 'Moved a lot');
    prisma.seedKpi('kpi_elsewhere', 'org_beta', [100, 150], 'Another organisation');

    const out = await withCtx({}, () => service.generateBatch());

    expect(out.insights.map((i) => i.kpiId)).toEqual(['kpi_big']);
    expect(out.skipped).toEqual({ tooFewValues: 1, littleChange: 1 });
    expect(out.thresholdChangePct).toBe(10);
  });

  test('with nothing worth an insight, the counts say so and no insight is made', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_one', ORG, [100], 'One value');

    const out = await withCtx({}, () => service.generateBatch({ thresholdChangePct: 25 }));

    expect(out.insights).toEqual([]);
    expect(out.skipped).toEqual({ tooFewValues: 1, littleChange: 0 });
    expect(out.thresholdChangePct).toBe(25);
    expect(aiRouter.complete).not.toHaveBeenCalled();
  });
});
