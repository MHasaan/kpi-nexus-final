import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiThresholdBandsController } from './kpi-threshold-bands.controller.js';
import { KpiThresholdBandsService } from './kpi-threshold-bands.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpiThresholdBandsController],
  providers: [KpiThresholdBandsService],
  exports: [KpiThresholdBandsService],
})
export class KpiThresholdBandsModule {}
