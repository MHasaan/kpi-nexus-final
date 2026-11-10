import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiCatalogEmbeddingService } from './kpi-catalog-embedding.service.js';
import { NlqController } from './nlq.controller.js';
import { NlqReembedQueueModule } from './nlq-reembed-queue.module.js';
import { NlqService } from './nlq.service.js';
import { ReembedProcessor } from './reembed.processor.js';
import { queueProcessors } from '../config/queue-workers.js';

/**
 * NlqModule — natural-language Q&A over a tenant's KPIs (retrieval-augmented,
 * pgvector). Imports KpisModule to reuse its visibility-filtered list as the
 * candidate set (the NLQ visibility guarantee). One-way imports → no cycle.
 *
 * Imports NlqReembedQueueModule (a standalone shim that registers the BullMQ
 * queue + exports ReembedProducer). KpisModule also imports
 * NlqReembedQueueModule so it can inject ReembedProducer without any
 * KpisModule ↔ NlqModule bidirectional dependency.
 */
@Module({
  imports: [PrismaModule, RbacModule, AiModule, KpisModule, NlqReembedQueueModule],
  controllers: [NlqController],
  providers: [NlqService, KpiCatalogEmbeddingService, ...queueProcessors([ReembedProcessor])],
  exports: [NlqService, KpiCatalogEmbeddingService],
})
export class NlqModule {}
