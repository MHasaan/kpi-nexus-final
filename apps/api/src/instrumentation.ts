import 'reflect-metadata';
import * as Sentry from '@sentry/node';

const SERVICE_NAME = 'kpi-nexus-api';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import(
    '@opentelemetry/exporter-trace-otlp-http'
  );
  const { Resource } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = await import(
    '@opentelemetry/semantic-conventions'
  );

  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
  });
  sdk.start();
}
