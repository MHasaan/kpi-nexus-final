import { Injectable, Logger } from '@nestjs/common';

import { AiConfigsService } from '../ai/ai-configs.service.js';
import { AiRouterService } from '../ai/ai-router.service.js';
import { KpisService } from '../kpis/kpis.service.js';
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

const MAX_CONTEXT_KPIS = 8;
const RECENT_POINTS = 6;

const SYSTEM_PROMPT = [
  'You are a KPI analytics assistant. Answer the question using ONLY the KPI data provided in the context.',
  "If the context does not contain data relevant to the question, say you don't have access to that information.",
  'Be concise and cite specific numbers when available.',
].join('\n');

/**
 * Natural-language query over a tenant's KPIs. Retrieval-augmented: the question
 * is embedded, matched against the pgvector catalog **restricted to the KPIs the
 * asker can see** (via KpisService.list, which applies buildKpiVisibilityWhere),
 * and the matched KPIs' metadata + recent values are injected as context.
 *
 * CRITICAL: the candidate set is the caller's visible KPIs and nothing else, so
 * NLQ can never surface PER_USER/PER_UNIT data the asker isn't entitled to —
 * the visibility guarantee is inherited from the exhaustively-tested list path,
 * not reimplemented here. (The 5-tool tool-use loop in the plan is a deferred
 * enhancement; this RAG form satisfies the same visibility invariant.)
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

    // The visibility boundary: only KPIs this principal can see.
    const visible = await this.kpis.list();
    const metaById = new Map(visible.map((k) => [k.id, k]));
    const visibleIds = visible.map((k) => k.id);

    // Embed the question and retrieve the most relevant *visible* KPIs.
    const [queryVec] = await this.aiRouter.embed('EMBEDDINGS', { texts: [question], model: '' });
    let chosenIds: string[] = [];
    if (queryVec && queryVec.length > 0) {
      const matches = await this.embeddings.cosineSearch(queryVec, visibleIds, 12);
      chosenIds = matches.map((m) => m.kpiId);
    }
    // Fallback when the catalog hasn't been embedded yet: use the first visible KPIs.
    if (chosenIds.length === 0) chosenIds = visibleIds.slice(0, MAX_CONTEXT_KPIS);
    chosenIds = chosenIds.slice(0, MAX_CONTEXT_KPIS);

    const context = await this.buildContext(ctx.organizationId, chosenIds, metaById);
    const route = await this.configs.resolve('NLQ_PRIMARY');

    const result = await this.aiRouter.complete('NLQ_PRIMARY', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Question: ${question}\n\nKPI context:\n${context || '(no KPIs available)'}` }],
      maxTokens: 700,
    });

    const sources: NlqSource[] = chosenIds
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

  /** Build the per-KPI context block (metadata + recent values) for chosen KPIs. */
  private async buildContext(
    organizationId: string,
    kpiIds: string[],
    metaById: Map<string, { id: string; name: string; description: string | null; unit: string | null }>,
  ): Promise<string> {
    const lines: string[] = [];
    // Layer-4: the answer quotes these values back to the asker — clamp the read to
    // their historyWindowDays so out-of-window values never enter the prompt (null ⇒ parity).
    const limits = await this.accessContext.dataLimits();
    const windowFrom = clampHistoryFrom(undefined, limits.historyWindowDays);
    for (const id of kpiIds) {
      const meta = metaById.get(id);
      if (!meta) continue; // defensive: never describe a KPI not in the visible set
      const points = await this.prisma.kPIDataPoint.findMany({
        where: {
          organizationId,
          kpiId: id,
          ...(windowFrom ? { recordedAt: { gte: windowFrom } } : {}),
        },
        orderBy: { recordedAt: 'desc' },
        take: RECENT_POINTS,
        select: { value: true },
      });
      const recent = points.map((p) => p.value).reverse();
      lines.push(
        `- ${meta.name}${meta.unit ? ` (${meta.unit})` : ''}: recent values [${recent.join(', ') || 'none'}]` +
          (meta.description ? `; ${meta.description}` : ''),
      );
    }
    return lines.join('\n');
  }

  /** Back-fill catalog embeddings for the current org. Returns count embedded. */
  async reembed(): Promise<{ embedded: number }> {
    return { embedded: await this.embeddings.reembedAllForOrg() };
  }
}
