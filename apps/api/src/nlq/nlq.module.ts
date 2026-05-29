import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiCatalogEmbeddingService } from './kpi-catalog-embedding.service.js';
import { NlqController } from './nlq.controller.js';
import { NlqService } from './nlq.service.js';

/**
 * NlqModule — natural-language Q&A over a tenant's KPIs (retrieval-augmented,
 * pgvector). Imports KpisModule to reuse its visibility-filtered list as the
 * candidate set (the NLQ visibility guarantee). One-way imports → no cycle.
 */
@Module({
  imports: [PrismaModule, RbacModule, AiModule, KpisModule],
  controllers: [NlqController],
  providers: [NlqService, KpiCatalogEmbeddingService],
  exports: [NlqService, KpiCatalogEmbeddingService],
})
export class NlqModule {}
