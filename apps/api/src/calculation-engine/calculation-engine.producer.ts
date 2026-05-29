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

  async enqueueRecompute(data: RecomputeJobData): Promise<void> {
    try {
      await this.queue.add('recompute', data, {
        jobId: `recompute-${data.kpiId}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (err) {
      this.logger.warn(`enqueueRecompute failed for kpi ${data.kpiId}: ${String(err)}`);
    }
  }

  async enqueueCascadeRollup(data: CascadeRollupJobData): Promise<void> {
    try {
      await this.queue.add('cascade-rollup', data, {
        // jobId must be unique per (parent, period) but contain no ':'.
        jobId: `rollup-${data.parentKpiId}-${data.periodStart.replace(/[:.]/g, '')}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (err) {
      this.logger.warn(`enqueueCascadeRollup failed for parent ${data.parentKpiId}: ${String(err)}`);
    }
  }
}
