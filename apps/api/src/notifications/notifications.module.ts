import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { NotificationAdaptersService } from './notification-adapters.service.js';
import { NotificationDeliveriesService } from './notification-deliveries.service.js';
import {
  NotificationDispatcherService,
  NOTIFICATION_RETRY_QUEUE,
} from './notification-dispatcher.service.js';
import { NotificationRetryProcessor } from './notification-retry.processor.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [
    EmailModule,
    PrismaModule,
    RbacModule,
    BullModule.registerQueue({ name: NOTIFICATION_RETRY_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationAdaptersService,
    NotificationDispatcherService,
    NotificationDeliveriesService,
    NotificationRetryProcessor,
  ],
  exports: [NotificationAdaptersService, NotificationDispatcherService],
})
export class NotificationsModule {}
