/**
 * RecommendationsService unit tests focused on the enriched LLM grounding.
 * In-memory Prisma fake for kPI / kPIDataPoint / alert / recommendation; the AI
 * router returns a fixed JSON blob and records its calls so we can assert the
 * user message contains target / direction / status / thresholds / change %.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AiRouterService } from '../ai/ai-router.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { RecommendationsService } from './recommendations.service.js';

interface FakeKpi {
  id: string;
  organizationId: string;
  name: string;
  deletedAt: Date | null;
  unit: string | null;
  direction: string;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

class FakePrisma {
  kpis: FakeKpi[] = [];
  dataPoints: Record<string, number[]> = {};
  private recSeq = 0;

  kPI = {
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
            targetValue: row.targetValue,
            warningThreshold: row.warningThreshold,
            criticalThreshold: row.criticalThreshold,
          }
        : null;
    }),
  };

  kPIDataPoint = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      // Service stores oldest→newest, queries desc then reverses; emulate desc.
      const values = this.dataPoints[where.kpiId as string] ?? [];
      return [...values].reverse().map((value) => ({ value }));
    }),
  };

  recommendation = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `rec_${++this.recSeq}`,
      ...data,
    })),
  };

  seedKpi(
    id: string,
    organizationId: string,
    values: number[],
    name = 'KPI',
    extra: Partial<Omit<FakeKpi, 'id' | 'organizationId' | 'name' | 'deletedAt'>> = {},
  ): void {
    this.kpis.push({
      id,
      organizationId,
      name,
      deletedAt: null,
      unit: extra.unit ?? null,
      direction: extra.direction ?? 'HIGHER_IS_BETTER',
      targetValue: extra.targetValue ?? null,
      warningThreshold: extra.warningThreshold ?? null,
      criticalThreshold: extra.criticalThreshold ?? null,
    });
    this.dataPoints[id] = values;
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

const REC_JSON = JSON.stringify({
  summary: 's',
  rootCauseHypotheses: [],
  suggestedActions: [],
  confidence: 0.6,
});

function makeService() {
  const prisma = new FakePrisma();
  const aiRouter = {
    complete: vi.fn(async () => ({
      content: REC_JSON,
      usage: { inputTokens: 1, outputTokens: 2 },
      actualCost: 0,
    })),
  } as unknown as AiRouterService;
  const service = new RecommendationsService(prisma as unknown as PrismaService, aiRouter);
  return { service, prisma, aiRouter };
}

/** Pull the user-message string out of the last aiRouter.complete(...) call. */
function lastUserMessage(aiRouter: AiRouterService): string {
  const mock = (aiRouter.complete as unknown as { mock: { calls: unknown[][] } }).mock;
  const lastCall = mock.calls[mock.calls.length - 1]!;
  const opts = lastCall[1] as { messages: Array<{ role: string; content: string }> };
  return opts.messages.find((m) => m.role === 'user')!.content;
}

describe('RecommendationsService.generate enriched grounding', () => {
  test('prompt includes unit, direction, target, status, thresholds, and change %', async () => {
    const { service, prisma, aiRouter } = makeService();
    // LOWER_IS_BETTER, latest 30 below target 20 → "above target".
    prisma.seedKpi('kpi_g', ORG, [50, 30], 'Latency', {
      unit: 'ms',
      direction: 'LOWER_IS_BETTER',
      targetValue: 20,
      warningThreshold: 40,
      criticalThreshold: 60,
    });

    await withCtx({}, () => service.generate({ kpiId: 'kpi_g' }));

    const msg = lastUserMessage(aiRouter);
    expect(msg).toContain('Latency (ms)');
    expect(msg).toContain('direction: LOWER_IS_BETTER');
    expect(msg).toContain('Target: 20');
    expect(msg).toContain('above target');
    expect(msg).toContain('warning 40');
    expect(msg).toContain('critical 60');
    // (30 - 50) / 50 * 100 = -40%
    expect(msg).toContain('-40%');
    // Recent values = newest periods, not newest entries (AN-002).
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0]).toMatchObject({ orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }] });
  });

  test('marks the latest value on target when it meets a LOWER_IS_BETTER target', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_on', ORG, [50, 15], 'Latency', {
      direction: 'LOWER_IS_BETTER',
      targetValue: 20,
    });

    await withCtx({}, () => service.generate({ kpiId: 'kpi_on' }));

    const msg = lastUserMessage(aiRouter);
    expect(msg).toContain('Target: 20');
    expect(msg).toContain('on target');
  });

  test('omits target/threshold lines when the KPI has none', async () => {
    const { service, prisma, aiRouter } = makeService();
    prisma.seedKpi('kpi_bare', ORG, [10, 11], 'Bare');

    await withCtx({}, () => service.generate({ kpiId: 'kpi_bare' }));

    const msg = lastUserMessage(aiRouter);
    expect(msg).not.toContain('Target:');
    expect(msg).not.toContain('Thresholds:');
  });
});
