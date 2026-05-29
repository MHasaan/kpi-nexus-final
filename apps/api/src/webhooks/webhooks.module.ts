import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { OutboundWebhookProcessor } from './outbound-webhook.processor.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService, OUTBOUND_WEBHOOK_QUEUE } from './webhooks.service.js';

@Module({
  imports: [
    AuditModule,
    RbacModule,
    PrismaModule,
    BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, OutboundWebhookProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
