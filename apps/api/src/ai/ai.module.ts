import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AiCallLogService } from './ai-call-log.service.js';
import { AiConfigsController } from './ai-configs.controller.js';
import { AiConfigsService } from './ai-configs.service.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { AiRouterService } from './ai-router.service.js';
import { ByoController } from './byo/byo.controller.js';
import { ByoKeyService } from './byo/byo-key.service.js';

/**
 * AiModule — the P5 AI core: multi-provider router with budget caps, per-feature
 * config, BYO-key encryption, and a call-log ledger. The feature modules
 * (insights, recommendations, NLQ, anomaly, forecast) import AiRouterService
 * from here. AiRouterService is assembled via a factory so its pure fallback
 * logic stays decoupled from Nest DI (and unit-testable with fakes).
 */
@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [AiConfigsController, ByoController],
  providers: [
    AiBudgetService,
    AiCallLogService,
    ByoKeyService,
    AiProviderRegistry,
    AiConfigsService,
    {
      provide: AiRouterService,
      useFactory: (
        registry: AiProviderRegistry,
        budget: AiBudgetService,
        callLog: AiCallLogService,
        configs: AiConfigsService,
      ) =>
        new AiRouterService({
          registry: { getProvider: (k) => registry.getProvider(k) },
          budget: { evaluate: (c) => budget.evaluate(c), debit: (c) => budget.debit(c) },
          callLog: { record: (e) => callLog.record(e) },
          resolveConfig: (f) => configs.resolve(f),
        }),
      inject: [AiProviderRegistry, AiBudgetService, AiCallLogService, AiConfigsService],
    },
  ],
  exports: [AiRouterService, AiBudgetService, AiProviderRegistry, AiConfigsService, ByoKeyService, AiCallLogService],
})
export class AiModule {}
