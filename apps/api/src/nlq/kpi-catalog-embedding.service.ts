import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { AiProviderKey } from '@kpi-nexus/contracts';

import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type EmbeddingColumn, columnForDim, sourceTextForKpi, toVectorLiteral } from './embedding-helpers.js';

export interface CatalogMatch {
  kpiId: string;
  similarity: number;
}

const COLUMN_TO_PROVIDER: Partial<Record<EmbeddingColumn, AiProviderKey>> = {
  embedding_openai: 'OPENAI',
  embedding_gemini: 'GEMINI',
};

function providerKeyForColumn(col: EmbeddingColumn): AiProviderKey {
  const key = COLUMN_TO_PROVIDER[col];
  if (!key) throw new Error(`No AiProviderKey mapping for embedding column ${col}`);
  return key;
}

/**
 * Maintains the pgvector KPI catalog used by NLQ retrieval. Embeddings are
 * written/searched via raw SQL (the `vector` columns are Prisma `Unsupported`
 * types). Search is always scoped to the org AND restricted to a caller-supplied
 * set of visible KPI ids — defense in depth on top of the NLQ service's
 * visibility filter.
 */
@Injectable()
export class KpiCatalogEmbeddingService {
  private readonly logger = new Logger(KpiCatalogEmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /** Embed one KPI's catalog text and upsert its vector. */
  async reembedKpi(kpiId: string): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true, description: true, tags: true },
    });
    if (!kpi) return false;

    const sourceText = sourceTextForKpi(kpi);
    const [vec] = await this.aiRouter.embed('EMBEDDINGS', { texts: [sourceText], model: '' });
    if (!vec || vec.length === 0) return false;

    const col = columnForDim(vec.length);
    const providerKey = providerKeyForColumn(col);
    const literal = toVectorLiteral(vec);

    // ON CONFLICT on the (kpiId, providerKey) unique index. Column name is from
    // a fixed safe set (columnForDim); values are parameterized.
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "KpiCatalogEmbedding" ("id","organizationId","kpiId","sourceText","providerKey","${col}","generatedAt")
       VALUES ($1,$2,$3,$4,$5::"AiProviderKey",$6::vector,now())
       ON CONFLICT ("kpiId","providerKey")
       DO UPDATE SET "sourceText"=EXCLUDED."sourceText","${col}"=EXCLUDED."${col}","generatedAt"=now()`,
      randomUUID(),
      ctx.organizationId,
      kpiId,
      sourceText,
      providerKey,
      literal,
    );
    return true;
  }

  /** Re-embed every active KPI in the current org. Returns the count embedded. */
  async reembedAllForOrg(): Promise<number> {
    const ctx = RequestContextStore.require();
    const kpis = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of kpis) {
      try {
        if (await this.reembedKpi(id)) n += 1;
      } catch (err) {
        this.logger.warn(`reembed failed for kpi ${id}: ${String(err)}`);
      }
    }
    return n;
  }

  /**
   * Cosine-similarity search over the org's catalog, restricted to `visibleKpiIds`.
   * Returns matches ordered by descending similarity. Empty input → empty result
   * (a user who can see nothing retrieves nothing).
   */
  async cosineSearch(queryVec: number[], visibleKpiIds: string[], limit = 20): Promise<CatalogMatch[]> {
    if (queryVec.length === 0 || visibleKpiIds.length === 0) return [];
    const ctx = RequestContextStore.require();
    const col = columnForDim(queryVec.length);
    const literal = toVectorLiteral(queryVec);

    const rows = await this.prisma.$queryRawUnsafe<Array<{ kpiId: string; similarity: number }>>(
      `SELECT "kpiId", 1 - ("${col}" <=> $1::vector) AS similarity
       FROM "KpiCatalogEmbedding"
       WHERE "organizationId" = $2 AND "${col}" IS NOT NULL AND "kpiId" = ANY($3::text[])
       ORDER BY "${col}" <=> $1::vector
       LIMIT $4`,
      literal,
      ctx.organizationId,
      visibleKpiIds,
      limit,
    );
    return rows.map((r) => ({ kpiId: r.kpiId, similarity: Number(r.similarity) }));
  }
}
