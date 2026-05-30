import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { IntegrationCryptoService } from './integration-crypto.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsService } from './integrations.service.js';

@Module({
  imports: [AuditModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationCryptoService],
  exports: [IntegrationsService, IntegrationCryptoService],
})
export class IntegrationsModule {}
