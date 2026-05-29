import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NotificationAdaptersService } from './notification-adapters.service.js';
import { NotificationDeliveriesService } from './notification-deliveries.service.js';
import {
  NotificationDispatcherService,
  NOTIFICATION_RETRY_QUEUE,
} from './notification-dispatcher.service.js';
import { NotificationRetryProcessor } from './notification-retry.processor.js';
import {
  NotificationDigestService,
  NOTIFICATION_DIGEST_QUEUE,
} from './notification-digest.service.js';
import { NotificationDigestProcessor } from './notification-digest.processor.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [
    EmailModule,
    PrismaModule,
    RbacModule,
    RealtimeModule,
    BullModule.registerQueue({ name: NOTIFICATION_RETRY_QUEUE }),
    BullModule.registerQueue({ name: NOTIFICATION_DIGEST_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationAdaptersService,
    NotificationDispatcherService,
    NotificationDeliveriesService,
    NotificationRetryProcessor,
    NotificationDigestService,
    NotificationDigestProcessor,
  ],
  exports: [
    NotificationAdaptersService,
    NotificationDispatcherService,
    NotificationDigestService,
  ],
})
export class NotificationsModule {}
