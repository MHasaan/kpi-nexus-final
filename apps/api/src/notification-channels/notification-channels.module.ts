import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationChannelsController } from './notification-channels.controller.js';
import { NotificationChannelsService } from './notification-channels.service.js';

@Module({
  imports: [AuditModule, RbacModule, PrismaModule, NotificationsModule],
  controllers: [NotificationChannelsController],
  providers: [NotificationChannelsService],
  exports: [NotificationChannelsService],
})
export class NotificationChannelsModule {}
