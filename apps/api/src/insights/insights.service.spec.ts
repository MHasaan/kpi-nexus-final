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
  kpis: Array<{ id: string; organizationId: string; name: string; deletedAt: Date | null }> = [];
  dataPoints: Record<string, number[]> = {};
  private insightSeq = 0;

  kPI = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = this.kpis.find(
        (k) =>
          k.id === where.id &&
          k.organizationId === where.organizationId &&
          k.deletedAt === (where.deletedAt as Date | null),
      );
      return row ? { id: row.id, name: row.name } : null;
    }),
  };

  kPIDataPoint = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      // Service stores oldest→newest, queries desc then reverses; emulate desc here.
      const values = this.dataPoints[where.kpiId as string] ?? [];
      return [...values].reverse().map((value) => ({ value }));
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
      const status = where.status as { not?: string } | undefined;
      return this.insights
        .filter((i) => i.organizationId === where.organizationId)
        .filter((i) => (status?.not ? i.status !== status.not : true))
        .map((i) => ({ ...i }));
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

  seedKpi(id: string, organizationId: string, values: number[], name = 'KPI'): void {
    this.kpis.push({ id, organizationId, name, deletedAt: null });
    this.dataPoints[id] = values;
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

function makeService() {
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
  const service = new InsightsService(prisma as unknown as PrismaService, aiRouter, configs);
  return { service, prisma };
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

describe('InsightsService.generate confidence', () => {
  test('persists a confidence within [0, 1]', async () => {
    const { service, prisma } = makeService();
    prisma.seedKpi('kpi_c1', ORG, [100, 101]);

    const insight = await withCtx({}, () => service.generate('kpi_c1'));

    expect(insight).not.toBeNull();
    expect(insight!.confidence).toBeGreaterThanOrEqual(0);
    expect(insight!.confidence).toBeLessThanOrEqual(1);
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
