import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const CALC_ENGINE_QUEUE = 'calc-engine';

export interface RecomputeJobData {
  organizationId: string;
  kpiId: string;
}

export interface CascadeRollupJobData {
  organizationId: string;
  parentKpiId: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
}

export type CalcEngineJobData = RecomputeJobData | CascadeRollupJobData;

/**
 * Enqueues recompute + cascade-rollup jobs onto the `calc-engine` queue. Called
 * fire-and-forget from KpiDataService after a non-COMPUTED insert and from the
 * processor itself for transitive propagation. Producers swallow+log so a queue
 * hiccup never fails the originating write.
 */
@Injectable()
export class CalculationEngineProducer {
  private readonly logger = new Logger(CalculationEngineProducer.name);

  constructor(
    @InjectQueue(CALC_ENGINE_QUEUE) private readonly queue: Queue<CalcEngineJobData>,
  ) {}

  // Deterministic jobIds collapse duplicate work that is still PENDING (many
  // rapid inserts → one recompute reading the latest values). removeOnComplete:
  // true frees the jobId once the job finishes, so a later change re-triggers a
  // fresh run rather than being swallowed as a "duplicate" of a historical job.
  async enqueueRecompute(data: RecomputeJobData): Promise<void> {
    try {
      await this.queue.add('recompute', data, {
        jobId: `recompute-${data.kpiId}`,
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (err) {
      this.logger.warn(`enqueueRecompute failed for kpi ${data.kpiId}: ${String(err)}`);
    }
  }

  async enqueueCascadeRollup(data: CascadeRollupJobData): Promise<void> {
    try {
      await this.queue.add('cascade-rollup', data, {
        // jobId must contain no ':'. Collapses pending rollups of the same
        // (parent, period); re-runnable once complete (removeOnComplete: true).
        jobId: `rollup-${data.parentKpiId}-${data.periodStart.replace(/[:.]/g, '')}`,
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (err) {
      this.logger.warn(`enqueueCascadeRollup failed for parent ${data.parentKpiId}: ${String(err)}`);
    }
  }
}
