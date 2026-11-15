import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const SLACK_COMMAND_QUEUE = 'slack-command';

export interface SlackAskJobData {
  organizationId: string;
  userId: string;
  question: string;
  /** Slack's https://hooks.slack.com/… URL for the delayed reply. */
  responseUrl: string;
}

/** Queues `/kpi ask` (NLQ takes longer than Slack's 3-second reply window). */
@Injectable()
export class SlackCommandProducer {
  constructor(@InjectQueue(SLACK_COMMAND_QUEUE) private readonly queue: Queue<SlackAskJobData>) {}

  async enqueueAsk(job: SlackAskJobData): Promise<void> {
    await this.queue.add('ask', job, { removeOnComplete: 100, removeOnFail: 100, attempts: 1 });
  }
}
