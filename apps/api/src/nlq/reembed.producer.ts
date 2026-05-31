import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const NLQ_REEMBED_QUEUE = 'nlq-reembed';

export interface ReembedKpiJobData {
  orgId: string;
  kpiId: string;
}

export interface ReembedOrgJobData {
  orgId: string;
}

export type ReembedJobData = ReembedKpiJobData | ReembedOrgJobData;

/**
 * Enqueues NLQ catalog re-embedding jobs onto the `nlq-reembed` queue.
 *
 * Called fire-and-forget:
 *   - from KpisService.create / KpisService.update (per-KPI, when semantic
 *     fields change)
 *   - from AiConfigsService.upsertConfig (whole-org, when the EMBEDDINGS
 *     provider switches)
 *
 * Deterministic jobIds collapse duplicate PENDING work. removeOnComplete: true
 * frees the jobId so a later change re-triggers a fresh run rather than being
 * silently deduplicated against a historical completed job.
 *
 * All public methods swallow errors so a queue hiccup can never fail a KPI
 * write or provider-config update.
 */
@Injectable()
export class ReembedProducer {
  private readonly logger = new Logger(ReembedProducer.name);

  constructor(
    @InjectQueue(NLQ_REEMBED_QUEUE) private readonly queue: Queue<ReembedJobData>,
  ) {}

  /** Enqueue re-embedding for a single KPI. */
  async enqueueKpi(orgId: string, kpiId: string): Promise<void> {
    try {
      await this.queue.add(
        'reembed-kpi',
        { orgId, kpiId } satisfies ReembedKpiJobData,
        {
          jobId: `reembed-${kpiId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.warn(`enqueueKpi failed for kpi ${kpiId}: ${String(err)}`);
    }
  }

  /** Enqueue re-embedding for all active KPIs in an org (provider switch). */
  async enqueueOrg(orgId: string): Promise<void> {
    try {
      await this.queue.add(
        'reembed-org',
        { orgId } satisfies ReembedOrgJobData,
        {
          jobId: `reembed-org-${orgId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.warn(`enqueueOrg failed for org ${orgId}: ${String(err)}`);
    }
  }
}
