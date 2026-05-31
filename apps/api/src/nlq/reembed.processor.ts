import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiCatalogEmbeddingService } from './kpi-catalog-embedding.service.js';
import {
  NLQ_REEMBED_QUEUE,
  type ReembedKpiJobData,
  type ReembedOrgJobData,
} from './reembed.producer.js';

/**
 * BullMQ worker for the `nlq-reembed` queue.
 *
 * Establishes a minimal system RequestContext (bypassRls = true; organizationId
 * is still the job's orgId so the embedding service's tenant-scoped Prisma
 * queries are correctly filtered) — the same pattern used by
 * CalculationEngineProcessor.
 *
 * 'reembed-kpi' → re-embeds a single KPI.
 * 'reembed-org' → re-embeds all active KPIs in the org (used after a provider
 *                  switch so every existing embedding row gets refreshed).
 */
@Processor(NLQ_REEMBED_QUEUE)
export class ReembedProcessor extends WorkerHost {
  private readonly logger = new Logger(ReembedProcessor.name);

  constructor(private readonly embedding: KpiCatalogEmbeddingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'reembed-kpi') {
      const { orgId, kpiId } = job.data as ReembedKpiJobData;
      await RequestContextStore.run(this.systemCtx(orgId), async () => {
        const ok = await this.embedding.reembedKpi(kpiId);
        this.logger.log(`reembed-kpi ${kpiId} → ${ok ? 'ok' : 'skipped (not found)'}`);
      });
      return;
    }

    if (job.name === 'reembed-org') {
      const { orgId } = job.data as ReembedOrgJobData;
      await RequestContextStore.run(this.systemCtx(orgId), async () => {
        const n = await this.embedding.reembedAllForOrg();
        this.logger.log(`reembed-org ${orgId} → ${n} KPI(s) re-embedded`);
      });
      return;
    }

    this.logger.warn(`nlq-reembed: unknown job name '${job.name}' — skipping`);
  }

  private systemCtx(organizationId: string) {
    return {
      userId: 'nlq-reembed-system',
      organizationId,
      roleId: null as string | null,
      principalType: 'user' as const,
      bypassRls: true,
    };
  }
}
