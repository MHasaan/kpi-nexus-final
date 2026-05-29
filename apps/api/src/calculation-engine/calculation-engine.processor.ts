import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RequestContextStore } from '../tenancy/request-context.js';
import { CalculationEngineService } from './calculation-engine.service.js';
import {
  CALC_ENGINE_QUEUE,
  CalculationEngineProducer,
  type CascadeRollupJobData,
  type RecomputeJobData,
} from './calculation-engine.producer.js';

/**
 * BullMQ worker for the `calc-engine` queue. Runs in the API process. Sets a
 * minimal system RequestContext (bypassRls=true; organizationId still filtered
 * explicitly) per job, delegates to the testable service, then enqueues
 * transitive work. The formula/cascade graphs are acyclic (enforced at attach),
 * so transitive propagation terminates.
 */
@Processor(CALC_ENGINE_QUEUE)
export class CalculationEngineProcessor extends WorkerHost {
  private readonly logger = new Logger(CalculationEngineProcessor.name);

  constructor(
    private readonly engine: CalculationEngineService,
    private readonly producer: CalculationEngineProducer,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'recompute') {
      const { organizationId, kpiId } = job.data as RecomputeJobData;
      await RequestContextStore.run(this.systemCtx(organizationId), async () => {
        const { value, dependents } = await this.engine.recomputeKpi(kpiId);
        if (value !== null) {
          this.logger.log(`recompute ${kpiId} = ${value} (${dependents.length} dependent(s))`);
        }
        for (const dep of dependents) {
          await this.producer.enqueueRecompute({ organizationId, kpiId: dep });
        }
      });
      return;
    }

    if (job.name === 'cascade-rollup') {
      const { organizationId, parentKpiId, periodStart, periodEnd } = job.data as CascadeRollupJobData;
      await RequestContextStore.run(this.systemCtx(organizationId), async () => {
        const { value, parents } = await this.engine.rollupParent(
          parentKpiId,
          new Date(periodStart),
          new Date(periodEnd),
        );
        if (value !== null) {
          this.logger.log(`rollup ${parentKpiId} = ${value} (${parents.length} parent(s))`);
        }
        for (const parent of parents) {
          await this.producer.enqueueCascadeRollup({ organizationId, parentKpiId: parent, periodStart, periodEnd });
        }
      });
      return;
    }

    this.logger.warn(`calc-engine: unknown job '${job.name}'`);
  }

  private systemCtx(organizationId: string) {
    return {
      userId: 'calc-engine-system',
      organizationId,
      roleId: null,
      principalType: 'user' as const,
      bypassRls: true,
    };
  }
}
