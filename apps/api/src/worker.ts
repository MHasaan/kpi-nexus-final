import './worker-role.js';
import './instrumentation.js';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { ensureProviderKeysLoaded } from './ai/provider-key-loader.js';
import { assertProductionSecrets } from './config/secrets.js';
import { WorkerModule } from './worker.module.js';

/**
 * Queue worker entrypoint (OT-003): runs the BullMQ processors with no HTTP
 * server. Same build and image as the API; start with `node dist/worker.js`.
 */
async function bootstrap(): Promise<void> {
  // Insights and re-embedding call the AI providers (see main.ts).
  ensureProviderKeysLoaded();

  // Same refusal as the API (OT-008), but before the context starts: creating
  // it starts the processors, which must not take a job with a bad secret.
  // instrumentation.js has already loaded .env.
  assertProductionSecrets();

  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  // Shutdown hooks close the BullMQ workers, which let active jobs finish.
  app.enableShutdownHooks();

  app.get(Logger).log('kpi-nexus-worker started (BullMQ processors running)', 'Bootstrap');
}

void bootstrap();
