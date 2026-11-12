import { Injectable, Logger } from '@nestjs/common';

import { AiConfigsService } from '../ai/ai-configs.service.js';
import { AiRouterService } from '../ai/ai-router.service.js';
import { KpiDataService } from '../kpis/kpi-data.service.js';
import { KpisService, type PublicKpi } from '../kpis/kpis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { clampHistoryFrom } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiCatalogEmbeddingService } from './kpi-catalog-embedding.service.js';

export interface NlqSource {
  kpiId: string;
  name: string;
}

export interface NlqAnswer {
  answer: string;
  sources: NlqSource[];
  latencyMs: number;
  costUsd: number;
  provider: string;
  model: string;
}

/**
 * The entire visible catalog is summarised for the model. `MAX_CATALOG` is a
 * safety bound (Helios has ~35) — past it we still summarise every KPI at the
 * latest-value level, we just stop attaching the deep recent series.
 */
const MAX_CATALOG = 60;
/** Up to this many (RAG-ordered) KPIs get the deep recent-series fetch. */
const DEEP_SERIES_KPIS = 24;
/** Recent points pulled per deep-series KPI. */
const RECENT_POINTS = 8;

const SYSTEM_PROMPT = [
  "You are the organization's KPI analyst. The context below contains the CURRENT STATE of every KPI the user can see — latest values, targets, threshold status, and recent trends. Use it to answer: compute trends and percentages, compare values to targets, rank or filter KPIs, and cite specific numbers. The data IS available to you in the context. Only say a metric is unavailable if that specific KPI is genuinely not in the list. Be concise and concrete.",
].join('\n');

type Direction = PublicKpi['direction'];

/**
 * Natural-language query over a tenant's KPIs. The model is grounded in the
 * caller's **entire visible KPI catalog** (not a small RAG window): for each
 * visible KPI we emit a rich line — latest value, target + on/off-target status,
 * thresholds, and a short recent trend with a change %. RAG (pgvector cosine
 * search) is now used only to ORDER the catalog so the most-relevant KPIs get
 * the deeper recent-series fetch; it is never a gate.
 *
 * CRITICAL: candidates come ONLY from `KpisService.list()` (which applies
 * buildKpiVisibilityHelper) — NLQ can never surface PER_USER/PER_UNIT data the
 * asker isn't entitled to. The visibility guarantee is inherited from the
 * exhaustively-tested list path, not reimplemented here. Per-KPI reads are also
 * Layer-4 clamped to the principal's historyWindowDays.
 */
@Injectable()
export class NlqService {
  private readonly logger = new Logger(NlqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly kpis: KpisService,
    private readonly embeddings: KpiCatalogEmbeddingService,
    private readonly configs: AiConfigsService,
    private readonly accessContext: AccessContextService,
    private readonly kpiData: KpiDataService,
  ) {}

  private now(): number {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  async ask(question: string): Promise<NlqAnswer> {
    const ctx = RequestContextStore.require();
    const started = this.now();

    // ── The visibility boundary: only KPIs this principal can see. ──────────
    const visible = await this.kpis.list();
    const metaById = new Map(visible.map((k) => [k.id, k]));
    const visibleIds = visible.map((k) => k.id);

    // ── RAG ordering (optional). Embed the question and order the visible set
    //    by cosine similarity so the most-relevant KPIs get the deep series.
    //    cosineSearch is restricted to visibleIds — defense in depth. ─────────
    let orderedIds: string[] = visibleIds;
    let hadEmbeddings = false;
    if (visibleIds.length > 0) {
      const [queryVec] = await this.aiRouter.embed('EMBEDDINGS', { texts: [question], model: '' });
      if (queryVec && queryVec.length > 0) {
        const matches = await this.embeddings.cosineSearch(queryVec, visibleIds, MAX_CATALOG);
        const matchedIds = matches.map((m) => m.kpiId).filter((id) => metaById.has(id));
        if (matchedIds.length > 0) {
          hadEmbeddings = true;
          // Matched (most-relevant) first, then any visible KPI without an embedding.
          const seen = new Set(matchedIds);
          orderedIds = [...matchedIds, ...visibleIds.filter((id) => !seen.has(id))];
        }
      }
    }

    // Best-effort: if the catalog has no embeddings yet, kick off a re-embed so
    // future queries get RAG ordering. Fire-and-forget — never block the answer.
    if (!hadEmbeddings && visibleIds.length > 0) {
      void this.embeddings.reembedAllForOrg().catch(() => {
        /* non-fatal: ordering still works off list order */
      });
    }

    // Cap the catalog for prompt-size safety; deep series only for the top N.
    const catalogIds = orderedIds.slice(0, MAX_CATALOG);
    const deepSet = new Set(catalogIds.slice(0, DEEP_SERIES_KPIS));

    const { context, deepIds } = await this.buildContext(ctx.organizationId, catalogIds, deepSet, metaById);

    const route = await this.configs.resolve('NLQ_PRIMARY');
    const result = await this.aiRouter.complete('NLQ_PRIMARY', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\n\nKPI context (current state of every KPI you can see):\n${context || '(no KPIs available)'}`,
        },
      ],
      maxTokens: 900,
    });

    // Sources = the KPIs we put deep detail on (or all when the catalog is small).
    const sourceIds = catalogIds.length <= 12 ? catalogIds : deepIds;
    const sources: NlqSource[] = sourceIds
      .map((id) => metaById.get(id))
      .filter((k): k is NonNullable<typeof k> => Boolean(k))
      .map((k) => ({ kpiId: k.id, name: k.name }));

    const answer: NlqAnswer = {
      answer: result.content,
      sources,
      latencyMs: this.now() - started,
      costUsd: result.actualCost,
      provider: route.provider,
      model: route.model,
    };

    await this.prisma.nLQQuery
      .create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          question,
          response: { answer: answer.answer, sources: answer.sources } as unknown as object,
          latencyMs: answer.latencyMs,
          costUsd: answer.costUsd,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          providerKey: route.provider,
          modelId: route.model,
          status: 'SUCCESS',
        },
      })
      .catch((err) => this.logger.warn(`NLQQuery log failed (non-fatal): ${String(err)}`));

    return answer;
  }

  /**
   * Build the full-catalog context block. Every catalog KPI gets a rich line
   * (latest value + target/status + thresholds); KPIs in `deepSet` additionally
   * get a recent trend series + change %. Returns the joined context and the
   * list of KPI ids we attached deep detail to (for `sources`).
   */
  private async buildContext(
    organizationId: string,
    catalogIds: string[],
    deepSet: Set<string>,
    metaById: Map<string, PublicKpi>,
  ): Promise<{ context: string; deepIds: string[] }> {
    // Latest value per KPI in ONE visibility + dataLimits aware call.
    const summaryByKpi = new Map<string, { latestValue: number | null; latestRecordedAt: Date | null }>();
    try {
      const summary = await this.kpiData.dashboardSummary();
      for (const row of summary) {
        summaryByKpi.set(row.kpiId, { latestValue: row.latestValue, latestRecordedAt: row.latestRecordedAt });
      }
    } catch (err) {
      this.logger.warn(`dashboardSummary failed (non-fatal): ${String(err)}`);
    }

    // categoryId → name (fetch all once, build a Map).
    const categoryById = new Map<string, string>();
    try {
      const cats = await this.prisma.kPICategory.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      });
      for (const c of cats) categoryById.set(c.id, c.name);
    } catch (err) {
      this.logger.warn(`category fetch failed (non-fatal): ${String(err)}`);
    }

    // Layer-4: the answer quotes these values back to the asker — clamp the
    // recent-series read to historyWindowDays so out-of-window values never
    // enter the prompt (null ⇒ parity).
    const limits = await this.accessContext.dataLimits();
    const windowFrom = clampHistoryFrom(undefined, limits.historyWindowDays);

    const lines: string[] = [];
    const deepIds: string[] = [];
    for (const id of catalogIds) {
      const meta = metaById.get(id);
      if (!meta) continue; // defensive: never describe a KPI not in the visible set

      const latest = summaryByKpi.get(id)?.latestValue ?? null;
      const latestAt = summaryByKpi.get(id)?.latestRecordedAt ?? null;

      let recent: number[] = [];
      if (deepSet.has(id)) {
        deepIds.push(id);
        const points = await this.prisma.kPIDataPoint.findMany({
          where: {
            organizationId,
            kpiId: id,
            ...(windowFrom ? { recordedAt: { gte: windowFrom } } : {}),
          },
          // Newest periods first ("latest" = newest period; entry time breaks ties).
          orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
          take: RECENT_POINTS,
          select: { value: true },
        });
        recent = points.map((p) => p.value).reverse();
      }

      lines.push(this.formatLine(meta, latest, latestAt, recent, categoryById));
    }

    return { context: lines.join('\n'), deepIds };
  }

  /** Render one rich catalog line, omitting null fields cleanly. */
  private formatLine(
    meta: PublicKpi,
    latest: number | null,
    latestAt: Date | null,
    recent: number[],
    categoryById: Map<string, string>,
  ): string {
    const parts: string[] = [];
    // Header: name (unit) [category] scope/direction
    let header = `- ${meta.name}`;
    if (meta.unit) header += ` (${meta.unit})`;
    const catName = meta.categoryId ? categoryById.get(meta.categoryId) : undefined;
    if (catName) header += ` [${catName}]`;
    header += ` ${meta.scope}/${meta.direction}`;
    parts.push(header);

    // Latest value (+ as-of date)
    if (latest != null) {
      const asOf = latestAt ? ` (as of ${formatDate(latestAt)})` : '';
      parts.push(`latest ${formatNum(latest)}${asOf}`);
    } else {
      parts.push('latest no data');
    }

    // Target → status
    if (meta.targetValue != null) {
      const status = latest != null ? targetStatus(latest, meta.targetValue, meta.direction) : null;
      parts.push(`target ${formatNum(meta.targetValue)}${status ? ` → ${status}` : ''}`);
    }

    // Thresholds (only the ones that are set)
    const th: string[] = [];
    if (meta.warningThreshold != null) th.push(`warn ${formatNum(meta.warningThreshold)}`);
    if (meta.criticalThreshold != null) th.push(`crit ${formatNum(meta.criticalThreshold)}`);
    if (th.length > 0) parts.push(`thresholds ${th.join('/')}`);

    // Recent trend + change %
    if (recent.length > 0) {
      const change = changePct(recent);
      const changeStr = change != null ? ` (change ${change}%)` : '';
      parts.push(`recent [${recent.map(formatNum).join(', ')}]${changeStr}`);
    }

    return parts.join('; ');
  }

  /** Back-fill catalog embeddings for the current org. Returns count embedded. */
  async reembed(): Promise<{ embedded: number }> {
    return { embedded: await this.embeddings.reembedAllForOrg() };
  }
}

/**
 * Compute on/under/over-target status honoring direction. Only meaningful when
 * a target is set + a value present (caller guards). TARGET_IS_BEST/NEUTRAL ⇒ —.
 */
function targetStatus(value: number, target: number, direction: Direction): string {
  switch (direction) {
    case 'HIGHER_IS_BETTER':
      return value >= target ? 'on target' : 'below target';
    case 'LOWER_IS_BETTER':
      return value <= target ? 'on target' : 'above target';
    default:
      return '—';
  }
}

/** Percent change across a recent series: (last − first)/first, rounded. */
function changePct(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (first === 0) return null; // undefined % change
  const pct = ((last - first) / Math.abs(first)) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

/** Trim trailing zeros for compact numbers; keep integers integer. */
function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function formatDate(d: Date): string {
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}
