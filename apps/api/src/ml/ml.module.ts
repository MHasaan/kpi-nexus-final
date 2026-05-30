import { Module } from '@nestjs/common';

import { MlClientService } from './ml-client.service.js';

/**
 * MlModule — the HMAC-signed HTTP client to the Python ML sidecar. Exported so
 * the anomaly/forecast/what-if modules can call the sidecar without each
 * re-implementing request signing.
 */
@Module({
  providers: [MlClientService],
  exports: [MlClientService],
})
export class MlModule {}
