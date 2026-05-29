import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

/**
 * BillingModule — plan catalog, quota enforcement, feature gating. Exports
 * BillingService so KpisModule can assert quota on KPI create (one-way import;
 * BillingModule only depends on Prisma, so no cycle).
 */
@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
