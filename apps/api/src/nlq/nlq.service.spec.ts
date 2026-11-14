/**
 * TDD spec for the NLQ "Ask" feature after the catalog-grounding rewrite.
 *
 * The critical behaviour under test: the LLM context now contains the ENTIRE
 * visible KPI catalog (not a cap of 8) with rich per-KPI state — latest value,
 * target, threshold status, recent trend — so the model can actually answer
 * questions about the org's data. Visibility is still inherited solely from
 * `kpis.list()`: a KPI not returned there must never appear in the context.
 *
 * Fakes (mirroring the patterns in reembed.spec.ts):
 *  - kpis.list()                  → the visible catalog (the visibility boundary)
 *  - kpiData.dashboardSummary()   → per-KPI latest value (one call)
 *  - kpiData.listForKpi()        → per-KPI recent series, already scoped to the asker
 *  - prisma.kPIDataPoint.findMany → an UNSCOPED read (must never feed the prompt)
 *  - embeddings.cosineSearch()    → RAG ordering (optional; [] ⇒ list order)
 *  - aiRouter.complete()          → captures the messages it receives
 *  - aiRouter.embed()             → the query vector
 *  - configs.resolve()            → route metadata
 *  - accessContext.dataLimits()   → Layer-4 clamp inputs
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { NlqService } from './nlq.service.js';

type Kpi = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  scope: 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BEST' | 'NEUTRAL';
  categoryId: string | null;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
};

const ORG = 'org-1';
const USER = 'user-1';

function kpi(partial: Partial<Kpi> & { id: string; name: string }): Kpi {
  return {
    description: null,
    unit: null,
    scope: 'ORG_WIDE',
    direction: 'HIGHER_IS_BETTER',
    categoryId: null,
    targetValue: null,
    warningThreshold: null,
    criticalThreshold: null,
    ...partial,
  };
}

/**
 * Build the service with controllable fakes. `kpis` is the visible catalog;
 * `latest` maps kpiId→latest value (dashboardSummary); `series` maps
 * kpiId→recent points (oldest→newest); `cosine` is the cosineSearch result.
 */
function buildService(opts: {
  kpis: Kpi[];
  latest?: Record<string, { latestValue: number | null; latestRecordedAt: Date | null }>;
  series?: Record<string, number[]>;
  cosine?: Array<{ kpiId: string; similarity: number }>;
  categories?: Array<{ id: string; name: string }>;
  /** What an unscoped read by kpiId returns (e.g. other users' points); defaults to `series`. */
  unscopedSeries?: Record<string, number[]>;
}) {
  const latest = opts.latest ?? {};
  const series = opts.series ?? {};
  const categories = opts.categories ?? [];

  // Capture the messages handed to the LLM so tests can assert the context.
  const completeCalls: Array<{ systemPrompt: string; messages: Array<{ role: string; content: string }>; maxTokens?: number }> = [];

  const aiRouter = {
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    complete: vi.fn().mockImplementation(async (_route: string, req: { systemPrompt: string; messages: Array<{ role: string; content: string }>; maxTokens?: number }) => {
      completeCalls.push(req);
      return {
        content: 'answer text',
        actualCost: 0.001,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    }),
  };

  const kpis = {
    list: vi.fn().mockResolvedValue(opts.kpis),
  };

  const kpiData = {
    // The scoped reader (KPI visibility + point scope + Layer-4 clamps). Returns DESC.
    listForKpi: vi.fn().mockImplementation(async (kpiId: string) =>
      [...(series[kpiId] ?? [])]
        .map((value, i) => ({ value, periodStart: new Date(Date.UTC(2026, 0, i + 1)), recordedAt: new Date('2026-01-01'), userId: null, orgUnitId: null }))
        .reverse(),
    ),
    dashboardSummary: vi.fn().mockImplementation(async () =>
      opts.kpis.map((k) => ({
        kpiId: k.id,
        name: k.name,
        scope: k.scope,
        unit: k.unit,
        targetValue: k.targetValue,
        latestValue: latest[k.id]?.latestValue ?? null,
        latestRecordedAt: latest[k.id]?.latestRecordedAt ?? null,
        aggregatedValue: null,
        pointCount: (series[k.id] ?? []).length,
        scorecardQuadrant: null,
      })),
    ),
  };

  const embeddings = {
    cosineSearch: vi.fn().mockResolvedValue(opts.cosine ?? []),
    reembedAllForOrg: vi.fn().mockResolvedValue(0),
  };

  const configs = {
    resolve: vi.fn().mockResolvedValue({ provider: 'GEMINI', model: 'gemini-test' }),
  };

  const accessContext = {
    dataLimits: vi.fn().mockResolvedValue({ historyWindowDays: null, maxListRows: null, maxExportRows: null }),
  };

  const prisma = {
    kPIDataPoint: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { kpiId: string } }) => {
        // Service fetches DESC and reverses; return DESC here.
        const pts = [...((opts.unscopedSeries ?? series)[where.kpiId] ?? [])].reverse();
        return pts.map((value) => ({ value, recordedAt: new Date('2026-01-01') }));
      }),
    },
    kPICategory: {
      findMany: vi.fn().mockResolvedValue(categories),
    },
    nLQQuery: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };

  const service = new NlqService(
    prisma as never,
    aiRouter as never,
    kpis as never,
    embeddings as never,
    configs as never,
    accessContext as never,
    kpiData as never,
  );

  return { service, aiRouter, kpis, kpiData, embeddings, configs, accessContext, prisma, completeCalls };
}

function run<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    { userId: USER, organizationId: ORG, roleId: null, principalType: 'user' },
    fn,
  ) as Promise<T>;
}

describe('NlqService.ask — catalog grounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes ALL visible KPIs in the context (not capped at 8)', async () => {
    const kpis = Array.from({ length: 15 }, (_, i) =>
      kpi({ id: `k${i}`, name: `KPI ${i}`, unit: 'units', targetValue: 100 }),
    );
    const latest = Object.fromEntries(
      kpis.map((k, i) => [k.id, { latestValue: i * 10, latestRecordedAt: new Date('2026-01-01') }]),
    );
    const { service, completeCalls } = buildService({ kpis, latest });

    await run(() => service.ask('how are we doing?'));

    expect(completeCalls).toHaveLength(1);
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    for (const k of kpis) {
      expect(content).toContain(k.name);
    }
  });

  it('renders latest value + target + a STATUS for HIGHER_IS_BETTER (on/below target)', async () => {
    const kpis = [
      kpi({ id: 'rev', name: 'Revenue', unit: 'USD', direction: 'HIGHER_IS_BETTER', targetValue: 100 }),
      kpi({ id: 'low', name: 'LowRev', unit: 'USD', direction: 'HIGHER_IS_BETTER', targetValue: 100 }),
    ];
    const latest = {
      rev: { latestValue: 120, latestRecordedAt: new Date('2026-01-01') }, // ≥ target ⇒ on target
      low: { latestValue: 80, latestRecordedAt: new Date('2026-01-01') }, // < target ⇒ below
    };
    const { service, completeCalls } = buildService({ kpis, latest });

    await run(() => service.ask('status?'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');

    const revLine = content.split('\n').find((l) => l.includes('Revenue'))!;
    const lowLine = content.split('\n').find((l) => l.includes('LowRev'))!;
    expect(revLine).toContain('120');
    expect(revLine).toContain('100');
    expect(revLine.toLowerCase()).toContain('on target');
    expect(lowLine.toLowerCase()).toContain('below target');
  });

  it('renders STATUS for LOWER_IS_BETTER (on/above target)', async () => {
    const kpis = [
      kpi({ id: 'cac', name: 'CAC', unit: 'USD', direction: 'LOWER_IS_BETTER', targetValue: 50 }),
      kpi({ id: 'churn', name: 'Churn', unit: '%', direction: 'LOWER_IS_BETTER', targetValue: 5 }),
    ];
    const latest = {
      cac: { latestValue: 40, latestRecordedAt: new Date('2026-01-01') }, // ≤ target ⇒ on target
      churn: { latestValue: 9, latestRecordedAt: new Date('2026-01-01') }, // > target ⇒ above
    };
    const { service, completeCalls } = buildService({ kpis, latest });

    await run(() => service.ask('status?'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');

    const cacLine = content.split('\n').find((l) => l.includes('CAC'))!;
    const churnLine = content.split('\n').find((l) => l.includes('Churn'))!;
    expect(cacLine.toLowerCase()).toContain('on target');
    expect(churnLine.toLowerCase()).toContain('above target');
  });

  it('only describes KPIs returned by kpis.list() — never one outside it', async () => {
    const visible = [kpi({ id: 'vis', name: 'VisibleKpi', unit: 'x' })];
    const { service, completeCalls, embeddings } = buildService({
      kpis: visible,
      // cosineSearch maliciously returns a hidden id — must still be excluded.
      cosine: [
        { kpiId: 'vis', similarity: 0.9 },
        { kpiId: 'HIDDEN', similarity: 0.99 },
      ],
    });

    await run(() => service.ask('q'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    expect(content).toContain('VisibleKpi');
    expect(content).not.toContain('HIDDEN');
    expect(embeddings.cosineSearch).toHaveBeenCalled();
  });

  it('empty embeddings (cosineSearch → []) still yields a full catalog context', async () => {
    const kpis = [
      kpi({ id: 'a', name: 'Alpha', unit: 'x', targetValue: 10 }),
      kpi({ id: 'b', name: 'Beta', unit: 'y' }),
    ];
    const latest = {
      a: { latestValue: 5, latestRecordedAt: new Date('2026-01-01') },
      b: { latestValue: null, latestRecordedAt: null },
    };
    const { service, completeCalls } = buildService({ kpis, latest, cosine: [] });

    await run(() => service.ask('q'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    expect(content).not.toContain('(no KPIs available)');
    expect(content).toContain('Alpha');
    expect(content).toContain('Beta');
  });

  it('fires a fire-and-forget reembed when the catalog has zero embeddings', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha' })];
    const { service, embeddings } = buildService({ kpis, cosine: [] });

    await run(() => service.ask('q'));
    // cosineSearch returned [] ⇒ best-effort reembed kicked off (not awaited).
    expect(embeddings.reembedAllForOrg).toHaveBeenCalled();
  });

  it('does NOT reembed when embeddings already exist', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha' })];
    const { service, embeddings } = buildService({
      kpis,
      cosine: [{ kpiId: 'a', similarity: 0.8 }],
    });

    await run(() => service.ask('q'));
    expect(embeddings.reembedAllForOrg).not.toHaveBeenCalled();
  });

  it('includes a recent trend series and change % when computable', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha', unit: 'x', targetValue: 100 })];
    const latest = { a: { latestValue: 20, latestRecordedAt: new Date('2026-01-01') } };
    const series = { a: [10, 12, 15, 20] }; // oldest→newest; +100%
    const { service, completeCalls, kpiData } = buildService({ kpis, latest, series });

    await run(() => service.ask('trend?'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    const line = content.split('\n').find((l) => l.includes('Alpha'))!;
    expect(line).toContain('10');
    expect(line).toContain('20');
    // change % over [10..20] = 100
    expect(line).toContain('100');
    // Read through the scoped reader (which orders newest periods first, AN-002).
    expect(kpiData.listForKpi).toHaveBeenCalledWith('a', { limit: 8 });
  });

  it('a PER_USER trend holds only the points the asker may see, never other users\' values', async () => {
    const kpis = [kpi({ id: 'p', name: 'Calls made', scope: 'PER_USER', targetValue: 50 })];
    const latest = { p: { latestValue: 40, latestRecordedAt: new Date('2026-01-01') } };
    // The asker's own points (what the scoped reader returns)…
    const series = { p: [30, 35, 40] };
    // …and what a read by kpiId alone returns: another user's 999 mixed in.
    const unscopedSeries = { p: [30, 999, 35, 40] };
    const { service, completeCalls } = buildService({ kpis, latest, series, unscopedSeries });

    await run(() => service.ask('how many calls?'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    expect(content).toContain('35');
    expect(content).not.toContain('999');
  });

  it('a series the scoped reader refuses is left out, not fatal', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha', targetValue: 100 })];
    const { service, completeCalls, kpiData } = buildService({ kpis, series: { a: [1, 2] } });
    kpiData.listForKpi.mockRejectedValueOnce(new Error('KPI not found'));

    await run(() => service.ask('trend?'));
    expect(completeCalls[0]!.messages[0]!.content).toContain('Alpha');
  });

  it('each catalog line carries the KPI id, so tool calls can name it', async () => {
    const kpis = [kpi({ id: 'cmabc123', name: 'Revenue' })];
    const { service, completeCalls } = buildService({ kpis });
    await run(() => service.ask('q'));
    const line = completeCalls[0]!.messages[0]!.content.split('\n').find((l) => l.includes('Revenue'))!;
    expect(line).toContain('id cmabc123');
  });

  it('resolves categoryId → category name in the line', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha', unit: 'x', categoryId: 'cat-1' })];
    const { service, completeCalls } = buildService({
      kpis,
      categories: [{ id: 'cat-1', name: 'Finance' }],
    });

    await run(() => service.ask('q'));
    const content = completeCalls[0]!.messages.map((m) => m.content).join('\n');
    expect(content).toContain('Finance');
  });

  it('uses the confident-analyst system prompt and maxTokens 900', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha' })];
    const { service, completeCalls } = buildService({ kpis });

    await run(() => service.ask('q'));
    expect(completeCalls[0]!.maxTokens).toBe(900);
    expect(completeCalls[0]!.systemPrompt.toLowerCase()).toContain('analyst');
    expect(completeCalls[0]!.systemPrompt).toContain('CURRENT STATE');
  });

  it('returns sources drawn from the visible catalog', async () => {
    const kpis = [
      kpi({ id: 'a', name: 'Alpha' }),
      kpi({ id: 'b', name: 'Beta' }),
    ];
    const { service } = buildService({ kpis });
    const answer = await run(() => service.ask('q'));
    expect(answer.sources.length).toBeGreaterThan(0);
    for (const s of answer.sources) {
      expect(['a', 'b']).toContain(s.kpiId);
    }
  });

  it('logs the NLQQuery row', async () => {
    const kpis = [kpi({ id: 'a', name: 'Alpha' })];
    const { service, prisma } = buildService({ kpis });
    await run(() => service.ask('q'));
    expect(prisma.nLQQuery.create).toHaveBeenCalledOnce();
  });
});

describe('NlqService.ask — tool-use loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  type Req = { messages: Array<{ role: string; content: string; toolCalls?: unknown[]; toolCallId?: string; toolName?: string }>; tools?: Array<{ name: string }> };
  const toolTurn = (calls: Array<{ id: string; name: string; input: object }>) => ({
    content: '',
    toolCalls: calls,
    finishReason: 'tool_use',
    actualCost: 0.002,
    usage: { inputTokens: 200, outputTokens: 20 },
  });
  const textTurn = (content: string) => ({ content, finishReason: 'stop', actualCost: 0.001, usage: { inputTokens: 100, outputTokens: 50 } });

  it('offers the tools, runs a tool call through the scoped reader, and sends the result back', async () => {
    const kpis = [kpi({ id: 'rev', name: 'Revenue', unit: 'USD' }), kpi({ id: 'churn', name: 'Churn' })];
    const { service, aiRouter, kpiData, completeCalls, prisma } = buildService({ kpis, series: { rev: [100, 120] } });
    const requests: Req[] = [];
    aiRouter.complete
      .mockImplementationOnce(async (_f: string, req: Req) => {
        requests.push(structuredClone(req));
        return toolTurn([{ id: 'c1', name: 'get_kpi_history', input: { kpiId: 'rev', limit: 5 } }]);
      })
      .mockImplementationOnce(async (_f: string, req: Req) => {
        requests.push(structuredClone(req));
        return textTurn('Revenue rose from 100 to 120.');
      });

    const out = await run(() => service.ask('How did revenue move?'));

    expect(requests[0]!.tools!.map((t) => t.name)).toEqual(['get_metadata', 'get_kpi_history', 'query_timeseries', 'compare_kpis']);
    expect(kpiData.listForKpi).toHaveBeenCalledWith('rev', { limit: 5 });
    const second = requests[1]!.messages;
    expect(second[1]).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1', name: 'get_kpi_history' }] });
    expect(second[2]).toMatchObject({ role: 'tool', toolCallId: 'c1', toolName: 'get_kpi_history' });
    expect(JSON.parse(second[2]!.content)).toMatchObject({ kpiId: 'rev', points: [{ value: 120 }, { value: 100 }] });

    expect(out.answer).toBe('Revenue rose from 100 to 120.');
    expect(out.costUsd).toBeCloseTo(0.003);
    expect(out.sources.map((s) => s.kpiId)).toContain('rev');
    expect(out.toolCalls).toEqual([{ name: 'get_kpi_history', kpiIds: ['rev'] }]);
    expect(prisma.nLQQuery.create.mock.calls[0]![0].data).toMatchObject({ inputTokens: 300, outputTokens: 70 });
    expect(completeCalls).toHaveLength(0); // the default fake was replaced for both rounds
  });

  it('a tool call on a KPI outside the asker\'s catalog is "not found" and reads nothing', async () => {
    const kpis = [kpi({ id: 'rev', name: 'Revenue' })];
    const { service, aiRouter, kpiData } = buildService({ kpis });
    let toolResult = '';
    aiRouter.complete
      .mockImplementationOnce(async () => toolTurn([{ id: 'c1', name: 'get_kpi_history', input: { kpiId: 'someone-elses-kpi' } }]))
      .mockImplementationOnce(async (_f: string, req: Req) => {
        toolResult = req.messages[2]!.content;
        return textTurn("I don't have access to that data.");
      });

    const out = await run(() => service.ask("What is John's attendance?"));
    expect(JSON.parse(toolResult)).toEqual({ error: 'KPI not found: someone-elses-kpi' });
    expect(kpiData.listForKpi).not.toHaveBeenCalledWith('someone-elses-kpi', expect.anything());
    expect(out.answer).toBe("I don't have access to that data.");
  });

  it('stops after 5 rounds of tool calls and returns a partial answer with a warning', async () => {
    const kpis = [kpi({ id: 'rev', name: 'Revenue' })];
    const { service, aiRouter } = buildService({ kpis });
    aiRouter.complete.mockImplementation(async () => ({ ...toolTurn([{ id: 'c', name: 'get_metadata', input: { kpiId: 'rev' } }]), content: 'Still checking.' }));

    const out = await run(() => service.ask('loop forever'));
    expect(aiRouter.complete).toHaveBeenCalledTimes(5);
    expect(out.warning).toBe('TOOL_ROUND_LIMIT');
    expect(out.answer).toBe('Still checking.');
  });

  it('a round-limit stop with no text still answers something', async () => {
    const kpis = [kpi({ id: 'rev', name: 'Revenue' })];
    const { service, aiRouter } = buildService({ kpis });
    aiRouter.complete.mockImplementation(async () => toolTurn([{ id: 'c', name: 'get_metadata', input: { kpiId: 'rev' } }]));
    const out = await run(() => service.ask('loop forever'));
    expect(out.answer).toMatch(/could not finish/i);
  });

  it('answers in one call when the model needs no tools (no warning, no tool calls)', async () => {
    const kpis = [kpi({ id: 'rev', name: 'Revenue' })];
    const { service, aiRouter } = buildService({ kpis });
    const out = await run(() => service.ask('hi'));
    expect(aiRouter.complete).toHaveBeenCalledTimes(1);
    expect(out.warning).toBeUndefined();
    expect(out.toolCalls).toEqual([]);
  });
});
