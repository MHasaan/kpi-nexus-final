import 'reflect-metadata';
import * as Sentry from '@sentry/node';

const SERVICE_NAME = process.env.KPI_PROCESS_ROLE === 'worker' ? 'kpi-nexus-worker' : 'kpi-nexus-api';

// This module is main.ts's FIRST import, so it runs before @nestjs/config loads
// .env — OTEL_EXPORTER_OTLP_ENDPOINT / SENTRY_DSN set only in .env were unset
// here and tracing never started (OT-018). Load .env now; variables already in
// the real environment win (process.loadEnvFile never overrides them).
try {
  process.loadEnvFile();
} catch {
  // No .env (production / CI pass real env vars) — nothing to load.
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const { resourceFromAttributes } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
  const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
  const { IORedisInstrumentation } = await import('@opentelemetry/instrumentation-ioredis');
  const { PrismaInstrumentation } = await import('@prisma/instrumentation');

  // Without instrumentations the SDK records nothing on its own (OT-018).
  // fastify, ioredis and @prisma/client are CommonJS, so their require() goes
  // through the hooks installed here — this module's top-level await holds
  // back main.ts's later imports until the SDK has started.
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new HttpInstrumentation({
        // Liveness probes would drown out real traffic.
        ignoreIncomingRequestHook: (req) => req.url === '/health',
      }),
      new IORedisInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
}
