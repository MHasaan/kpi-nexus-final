import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RequestContextStore } from '../tenancy/request-context.js';
import { AlertEngineService } from './alert-engine.service.js';
import { ALERT_EVAL_QUEUE, type AlertEvalJobData } from './alert-engine.producer.js';

/**
 * AlertEngineProcessor — BullMQ worker for the `alert-eval` queue. Runs inside
 * the API process. No HTTP request, so it sets up a minimal system
 * RequestContext (bypassRls=true; organizationId still filtered explicitly in
 * every query) before delegating to the testable AlertEngineService.
 */
@Processor(ALERT_EVAL_QUEUE)
export class AlertEngineProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertEngineProcessor.name);

  constructor(private readonly engine: AlertEngineService) {
    super();
  }

  async process(job: Job<AlertEvalJobData>): Promise<void> {
    const { organizationId, kpiId, value, recordedAt, targetUserId } = job.data;
    await RequestContextStore.run(
      {
        userId: 'alert-engine-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      async () => {
        const created = await this.engine.evaluateKpi({
          organizationId,
          kpiId,
          value,
          recordedAt: new Date(recordedAt),
          targetUserId: targetUserId ?? null,
        });
        if (created.length > 0) {
          this.logger.log(
            `alert-eval job ${job.id ?? '?'}: created ${created.length} alert(s) for kpi ${kpiId}`,
          );
        }
      },
    );
  }
}
