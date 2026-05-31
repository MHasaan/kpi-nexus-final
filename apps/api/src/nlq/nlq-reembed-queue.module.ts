import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NLQ_REEMBED_QUEUE, ReembedProducer } from './reembed.producer.js';

/**
 * Standalone queue module that owns the `nlq-reembed` BullMQ registration +
 * the producer token.  Kept thin on purpose — no processor, no embedding
 * service, no imports of KpisModule or NlqModule.
 *
 * This breaks what would otherwise be a KpisModule ↔ NlqModule circular
 * dependency:
 *
 *   NlqModule     imports KpisModule  (for visibility-filtered KPI list)
 *   KpisModule    needs ReembedProducer (to enqueue after create/update)
 *
 * Without a shared anchor, making KpisModule import NlqModule (which imports
 * KpisModule) forms a cycle.  The solution: extract the one shared artifact
 * (producer + queue registration) into NlqReembedQueueModule.  Both modules
 * import it; neither imports the other for this purpose.
 *
 *   NlqReembedQueueModule  ← imported by KpisModule   (one-way, no return edge)
 *   NlqReembedQueueModule  ← imported by NlqModule    (one-way, no return edge)
 *
 * The processor (ReembedProcessor) lives in NlqModule where it can access
 * KpiCatalogEmbeddingService.
 */
@Module({
  imports: [BullModule.registerQueue({ name: NLQ_REEMBED_QUEUE })],
  providers: [ReembedProducer],
  exports: [ReembedProducer],
})
export class NlqReembedQueueModule {}
