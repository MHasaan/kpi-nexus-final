import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EscalationProcessor } from './escalation.processor.js';
import { EscalationsService, ESCALATION_QUEUE } from './escalations.service.js';
import { queueProcessors } from '../config/queue-workers.js';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    NotificationsModule,
    BullModule.registerQueue({ name: ESCALATION_QUEUE }),
  ],
  providers: [EscalationsService, ...queueProcessors([EscalationProcessor])],
  exports: [EscalationsService],
})
export class EscalationsModule {}
