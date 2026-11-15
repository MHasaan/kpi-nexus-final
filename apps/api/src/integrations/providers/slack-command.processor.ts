import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { NlqService } from '../../nlq/nlq.service.js';
import { outboundFetch } from '../../outbound/outbound-fetch.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { SLACK_COMMAND_QUEUE, type SlackAskJobData } from './slack-command.producer.js';
import { isSlackResponseUrl } from './slack-command.service.js';

/**
 * Answers `/kpi ask` AS the linked user (NLQ applies their visibility) and
 * posts the answer to Slack's response_url, privately.
 */
@Processor(SLACK_COMMAND_QUEUE)
export class SlackCommandProcessor extends WorkerHost {
  private readonly logger = new Logger(SlackCommandProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nlq: NlqService,
  ) {
    super();
  }

  async process(job: Job<SlackAskJobData>): Promise<void> {
    const { organizationId, userId, question, responseUrl } = job.data;
    if (!isSlackResponseUrl(responseUrl)) return;
    const user = await RequestContextStore.runWithBypass('slack-ask-user', () =>
      this.prisma.user.findFirst({ where: { id: userId, organizationId, status: 'ACTIVE', isActive: true }, select: { roleId: true } }),
    );
    let text: string;
    if (!user) {
      text = 'Your linked KPI Nexus account is not active.';
    } else {
      try {
        const answer = await RequestContextStore.run({ userId, organizationId, roleId: user.roleId, principalType: 'user' }, () => this.nlq.ask(question));
        text = answer.answer || 'No answer.';
      } catch (err) {
        this.logger.warn(`slack /kpi ask failed: ${String(err)}`);
        text = "Sorry, I couldn't answer that right now.";
      }
    }
    await outboundFetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text }),
      signal: AbortSignal.timeout(10_000),
    });
  }
}
