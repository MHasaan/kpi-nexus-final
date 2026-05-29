import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RequestContextStore } from '../tenancy/request-context.js';
import {
  NotificationDispatcherService,
  NOTIFICATION_RETRY_QUEUE,
  type NotificationRetryJobData,
} from './notification-dispatcher.service.js';

@Processor(NOTIFICATION_RETRY_QUEUE)
export class NotificationRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationRetryProcessor.name);

  constructor(private readonly dispatcher: NotificationDispatcherService) {
    super();
  }

  async process(job: Job<NotificationRetryJobData>): Promise<void> {
    const { deliveryId, organizationId } = job.data;
    await RequestContextStore.run(
      {
        userId: 'notification-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      () => this.dispatcher.attemptDelivery(deliveryId),
    );
  }
}
