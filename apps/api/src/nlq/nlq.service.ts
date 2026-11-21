import { fiscalConfigOf } from '@kpi-nexus/contracts';
import { Injectable, Logger } from '@nestjs/common';
import type { AiCompletionResult, AiMessage } from '@kpi-nexus/ai';

import { AiConfigsService } from '../ai/ai-configs.service.js';
import { AiRouterService } from '../ai/ai-router.service.js';
import { ForecastsService } from '../analytics/forecasts.service.js';
import { KpiDataService } from '../kpis/kpi-data.service.js';
import { KpisService, type PublicKpi } from '../kpis/kpis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiCatalogEmbeddingService } from './kpi-catalog-embedding.service.js';
import { NLQ_TOOLS, NlqToolbox, seriesNamesFrom } from './nlq.tools.js';
import { MAX_HISTORY_TURNS, type NlqTurn } from './nlq-ask.dto.js';
import { type KpiHolders, holdersText } from '@kpi-nexus/contracts';

export interface NlqSource {
  kpiId: string;
  name: string;
}

export interface NlqAnswer {
  answer: string;
  sources: NlqSource[];
  /** Tools the model called, in order, with the visible KPIs each read. */
  toolCalls: Array<{ name: string; kpiIds: string[] }>;
  /** Set when the answer is partial: the model was still calling tools after MAX_TOOL_ROUNDS. */
  warning?: 'TOOL_ROUND_LIMIT';
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
/** Model calls per question, tool rounds included (a hard cost cap). */
const MAX_TOOL_ROUNDS = 5;
/** Tool calls honoured per round, and characters of each result sent back. */
const MAX_CALLS_PER_ROUND = 6;
const MAX_TOOL_RESULT_CHARS = 8000;

const SYSTEM_PROMPT = [
  "You are the organization's KPI analyst. The context below contains the CURRENT STATE of every KPI the user can see — latest values, targets, threshold status, and recent trends. Use it to answer: compute trends and percentages, compare values to targets, rank or filter KPIs, and cite specific numbers. The data IS available to you in the context. Only say a metric is unavailable if that specific KPI is genuinely not in the list. Be concise and concrete.",
  'When the context is not enough (exact dates, a longer history, a date range, a side-by-side comparison), call a tool with KPI ids from the context. A tool answers "KPI not found" for any KPI the user cannot see: then say you do not have access to that data.',
  'For a per-unit or per-person KPI, get_kpi_history and query_timeseries return one series per team or person, named: use them to compare teams or people, and say so when only one series comes back.',
  'Each line\'s "status:" (on track, at risk, off track) is the app\'s own judgement from the KPI\'s thresholds, the same the dashboard shows. Answer any question about what is on track, at risk or off track by it, never by comparing the value with the target yourself: a KPI can be below its target and still on track. Say "below target" only as a fact beside the status.',
  'Read "off target", "behind", "missing its target", "struggling" or "in trouble" as questions about status too: list the off track KPIs, then the at risk ones, and give only the number of others that are below target but on track. Only a question about the target itself ("which are below target?") is answered from values and targets, with each KPI\'s status beside it.',
  'Take every count of KPIs (how many are off track, at risk, on track, or miss their target) from the "Status summary" line, which the app counted; never count the lines yourself.',
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
    private readonly forecasts: ForecastsService,
  ) {}

  private now(): number {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  async ask(question: string, history: NlqTurn[] = []): Promise<NlqAnswer> {
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
    const { result, costUsd, usage, toolCalls, warning } = await this.runToolLoop(question, context, metaById, history);

    // Sources = the KPIs we put deep detail on (or all when the catalog is small),
    // plus any KPI a tool read.
    const toolKpiIds = toolCalls.flatMap((c) => c.kpiIds);
    const sourceIds = [...new Set([...(catalogIds.length <= 12 ? catalogIds : deepIds), ...toolKpiIds])];
    const sources: NlqSource[] = sourceIds
      .map((id) => metaById.get(id))
      .filter((k): k is NonNullable<typeof k> => Boolean(k))
      .map((k) => ({ kpiId: k.id, name: k.name }));

    const answer: NlqAnswer = {
      answer: result.content || (warning ? 'I could not finish looking this up. Try a narrower question.' : ''),
      sources,
      toolCalls,
      ...(warning ? { warning } : {}),
      latencyMs: this.now() - started,
      costUsd,
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
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          providerKey: route.provider,
          modelId: route.model,
          status: 'SUCCESS',
        },
      })
      .catch((err) => this.logger.warn(`NLQQuery log failed (non-fatal): ${String(err)}`));

    return answer;
  }

  /**
   * The tool-use loop: up to MAX_TOOL_ROUNDS model calls. Each round's tool
   * calls run in an NlqToolbox bound to the asker's visible catalog (reads go
   * through the scoped KpiDataService.listForKpi) and their results go back as
   * `tool` turns. A model still calling tools after the last round gets a
   * partial answer flagged TOOL_ROUND_LIMIT.
   */
  private async runToolLoop(question: string, context: string, metaById: Map<string, PublicKpi>, history: NlqTurn[] = []) {
    // Weeks are grouped in the organisation's calendar. Not knowing it is no reason to refuse the question.
    const ctx = RequestContextStore.require();
    const org = await this.prisma.organization
      .findUnique({ where: { id: ctx.organizationId }, select: { weekStartsOn: true, fiscalCalendar: true } })
      .catch(() => null);
    const toolbox = new NlqToolbox(this.kpiData, metaById, this.forecasts, fiscalConfigOf(org).weekStartsOn, seriesNamesFrom(this.prisma, ctx.organizationId));
    const messages: AiMessage[] = [
      // The conversation so far, so a follow-up has something to refer to. The KPI context goes
      // with the new question only: it is the current state, and one copy is enough.
      ...history.slice(-MAX_HISTORY_TURNS).flatMap((turn): AiMessage[] => [
        { role: 'user', content: `Question: ${turn.question}` },
        { role: 'assistant', content: turn.answer },
      ]),
      {
        role: 'user',
        content: `Question: ${question}\n\nKPI context (current state of every KPI you can see):\n${context || '(no KPIs available)'}`,
      },
    ];
    const toolCalls: NlqAnswer['toolCalls'] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    let costUsd = 0;
    let result: AiCompletionResult | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      result = await this.aiRouter.complete('NLQ_PRIMARY', { systemPrompt: SYSTEM_PROMPT, messages, maxTokens: 900, tools: NLQ_TOOLS });
      costUsd += result.actualCost;
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      const calls = (result.toolCalls ?? []).slice(0, MAX_CALLS_PER_ROUND);
      if (calls.length === 0) return { result, costUsd, usage, toolCalls };

      messages.push({ role: 'assistant', content: result.content, toolCalls: calls });
      for (const call of calls) {
        const ran = await toolbox.run(call);
        toolCalls.push({ name: call.name, kpiIds: ran.kpiIds });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(ran.result).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      }
    }
    this.logger.warn(`NLQ hit the ${MAX_TOOL_ROUNDS}-round tool limit; returning a partial answer`);
    return { result: result!, costUsd, usage, toolCalls, warning: 'TOOL_ROUND_LIMIT' as const };
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
    const summaryByKpi = new Map<string, { latestValue: number | null; latestRecordedAt: Date | null; holders: KpiHolders | null; scope: string; status?: string }>();
    try {
      const summary = await this.kpiData.dashboardSummary();
      for (const row of summary) {
        summaryByKpi.set(row.kpiId, { latestValue: row.latestValue, latestRecordedAt: row.latestRecordedAt, holders: row.holders, scope: row.scope, status: row.status });
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

    const lines: string[] = [];
    const deepIds: string[] = [];
    for (const id of catalogIds) {
      const meta = metaById.get(id);
      if (!meta) continue; // defensive: never describe a KPI not in the visible set

      const latest = summaryByKpi.get(id)?.latestValue ?? null;
      const latestAt = summaryByKpi.get(id)?.latestRecordedAt ?? null;

      // A per-person or per-unit KPI with several holders in sight has no one value and no one
      // series (UI-018): say how many are on track, and draw no trend through different people's values.
      const held = summaryByKpi.get(id);
      if (held?.holders) {
        lines.push(`${this.formatLine(meta, null, latestAt, [], categoryById, held.status)} | ${holdersText(held.holders, held.scope)} (each holder has their own value and target)`);
        continue;
      }

      let recent: number[] = [];
      if (deepSet.has(id)) {
        deepIds.push(id);
        // The answer quotes these values back to the asker, so read them the way
        // GET /kpis/:id/data does: only the points this KPI's scope lets the
        // asker see (a PER_USER KPI's other users' values never enter the
        // prompt), clamped to historyWindowDays and newest periods first.
        try {
          const points = await this.kpiData.listForKpi(id, { limit: RECENT_POINTS });
          recent = points.map((p) => p.value).reverse();
        } catch (err) {
          this.logger.warn(`recent series for ${id} skipped: ${String(err)}`);
        }
      }

      lines.push(this.formatLine(meta, latest, latestAt, recent, categoryById, summaryByKpi.get(id)?.status));
    }

    // Counted here, over every KPI the dashboard counts: left to count a list of 37 lines, the model miscounted.
    const summary = statusSummary(
      catalogIds.flatMap((id) => {
        const meta = metaById.get(id);
        const row = summaryByKpi.get(id);
        if (!meta || !row?.status) return [];
        const several = Boolean(row.holders);
        const comparison =
          !several && row.latestValue != null && meta.targetValue != null ? targetStatus(row.latestValue, meta.targetValue, meta.direction) : null;
        return [{ name: meta.name, status: row.status, several, comparison }];
      }),
    );
    return { context: [...(summary ? [summary] : []), ...lines].join('\n'), deepIds };
  }

  /** Render one rich catalog line, omitting null fields cleanly. */
  private formatLine(
    meta: PublicKpi,
    latest: number | null,
    latestAt: Date | null,
    recent: number[],
    categoryById: Map<string, string>,
    /** The app's own status (dashboardSummary): what the dashboard shows. */
    status?: string,
  ): string {
    const parts: string[] = [];
    // Header: name (unit) [category] scope/direction
    let header = `- ${meta.name} (id ${meta.id})`;
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

    // Target → how the latest value compares with it (a fact, not the status).
    if (meta.targetValue != null) {
      const comparison = latest != null ? targetStatus(latest, meta.targetValue, meta.direction) : null;
      parts.push(`target ${formatNum(meta.targetValue)}${comparison ? ` → ${comparison}` : ''}`);
    }

    // The app's own status, from the KPI's thresholds — the one status questions are answered by.
    const said = status ? STATUS_WORDS[status] : undefined;
    if (said) parts.push(`status: ${said}`);

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
/** A KPI and the app's status for it, for the status summary. */
interface CountedKpi {
  name: string;
  status: string;
  /** Held by several teams or people, each with their own value: no one value to compare with a target. */
  several: boolean;
  /** How the one latest value compares with the target: 'on target', 'below target', 'above target', or none. */
  comparison: string | null;
}

/**
 * What the dashboard's statuses add up to, counted here. Left to count a list of 37 lines, the model said "17 other
 * KPIs" where there were 19 (2026-11-20). Null when no KPI has a status.
 */
function statusSummary(kpis: CountedKpi[]): string | null {
  if (kpis.length === 0) return null;
  const named = (status: string) => kpis.filter((k) => k.status === status).map((k) => k.name);
  const list = (names: string[]) => (names.length > 0 ? ` (${names.join(', ')})` : '');
  const off = named('OFF_TRACK');
  const risk = named('AT_RISK');
  const single = kpis.filter((k) => !k.several);
  const misses = (k: CountedKpi) => k.comparison === 'below target' || k.comparison === 'above target';
  const below = single.filter((k) => k.comparison === 'below target').length;
  const above = single.filter((k) => k.comparison === 'above target').length;
  const several = kpis.length - single.length;
  return [
    `Status summary, counted by the app as the dashboard shows it, over ${kpis.length} KPIs: off track ${off.length}${list(off)}; at risk ${risk.length}${list(risk)}; on track ${named('ON_TRACK').length}; no target ${named('NO_TARGET').length}; no data yet ${named('NO_DATA').length}.`,
    `Of the ${single.length} KPIs with one value each, ${single.filter((k) => k.status === 'ON_TRACK' && misses(k)).length} on track ones miss their target; ${below} are below their target (higher is better) and ${above} above it (lower is better).`,
    ...(several > 0
      ? [`${several === 1 ? 'The other one is' : `The other ${several} are`} recorded by several teams or people; their own lines say how many of them are on track.`]
      : []),
  ].join(' ');
}

/** The app's health statuses (KpiHealthStatus) in the words the dashboard uses. */
const STATUS_WORDS: Readonly<Record<string, string>> = {
  ON_TRACK: 'on track',
  AT_RISK: 'at risk',
  OFF_TRACK: 'off track',
  NO_TARGET: 'no target set',
  NO_DATA: 'no data yet',
};

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
