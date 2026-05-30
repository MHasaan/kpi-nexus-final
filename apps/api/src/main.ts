import './instrumentation.js';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { ensureProviderKeysLoaded } from './ai/provider-key-loader.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // Load AI provider keys from the local .env even if a launcher pre-set them
  // empty (which @nestjs/config won't override). Must run before any AI call.
  ensureProviderKeysLoaded();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // CORS — allow the web dev server (3000) and any configured origin. In
  // prod a single allowed origin (custom domain) is set via env.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'if-match'],
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`kpi-nexus-api listening on http://0.0.0.0:${port}`, 'Bootstrap');
}

void bootstrap();
