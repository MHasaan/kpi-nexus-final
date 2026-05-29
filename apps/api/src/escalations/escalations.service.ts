import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const ESCALATION_QUEUE = 'escalation';

export interface EscalationJobData {
  alertId: string;
  organizationId: string;
  level: number;
}

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(
    @InjectQueue(ESCALATION_QUEUE) private readonly queue: Queue<EscalationJobData>,
  ) {}

  /**
   * Schedule an escalation level to fire after `delayMs`. The jobId is
   * deterministic (`escalate-<alertId>-lvl<n>`) so a crash mid-handoff or a
   * duplicate enqueue does not double-schedule the same level.
   */
  async enqueueLevel(
    alertId: string,
    organizationId: string,
    level: number,
    delayMs: number,
  ): Promise<void> {
    try {
      await this.queue.add(
        'escalate',
        { alertId, organizationId, level },
        {
          delay: Math.max(0, delayMs),
          jobId: `escalate-${alertId}-lvl${level}`,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (err) {
      this.logger.warn(`enqueueLevel failed for alert ${alertId} lvl ${level}: ${String(err)}`);
    }
  }
}
