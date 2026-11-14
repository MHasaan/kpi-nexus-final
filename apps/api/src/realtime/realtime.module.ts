import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RealtimeAccessService } from './realtime-access.service.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [AlertsModule, RbacModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeAccessService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
