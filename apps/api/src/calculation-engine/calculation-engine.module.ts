import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CascadeService } from '../kpis/cascade.service.js';
import { LineageModule } from '../lineage/lineage.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { CalculationEngineController } from './calculation-engine.controller.js';
import { CalculationEngineProcessor } from './calculation-engine.processor.js';
import { CALC_ENGINE_QUEUE, CalculationEngineProducer } from './calculation-engine.producer.js';
import { CalculationEngineService } from './calculation-engine.service.js';

/**
 * CalculationEngineModule — reactive recompute pipeline. RECOMPUTE re-evaluates
 * formula KPIs; CASCADE_ROLLUP rolls children up to parents. Both write COMPUTED
 * data points + lineage edges and propagate transitively via the queue.
 *
 * Exports the producer so KpisModule can enqueue from DataPointsService with a
 * one-way dependency (KpisModule -> CalculationEngineModule). To keep that edge
 * acyclic this module does NOT import KpisModule; it provides the stateless,
 * Prisma-only CascadeService directly.
 */
@Module({
  imports: [
    PrismaModule,
    RbacModule,
    LineageModule,
    BullModule.registerQueue({ name: CALC_ENGINE_QUEUE }),
  ],
  controllers: [CalculationEngineController],
  providers: [CascadeService, CalculationEngineService, CalculationEngineProducer, CalculationEngineProcessor],
  exports: [CalculationEngineProducer, CalculationEngineService],
})
export class CalculationEngineModule {}
