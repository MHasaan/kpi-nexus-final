import './instrumentation.js';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { ensureProviderKeysLoaded } from './ai/provider-key-loader.js';
import { AppModule } from './app.module.js';
import { fastifyTrustProxy } from './config/trust-proxy.js';

async function bootstrap(): Promise<void> {
  // Load AI provider keys from the local .env even if a launcher pre-set them
  // empty (which @nestjs/config won't override). Must run before any AI call.
  ensureProviderKeysLoaded();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // maxParamLength default is 100, which 404s long path params — e.g. the public
    // embed-resolve token (/public/embed/kpi/:token, a ~200-char signed token).
    // trustProxy: only honour X-Forwarded-* when TRUST_PROXY says a proxy is in
    // front (read from the process environment, not .env). Otherwise req.ip is
    // the socket peer and can't be spoofed to dodge per-IP rate limits.
    new FastifyAdapter({ trustProxy: fastifyTrustProxy(process.env.TRUST_PROXY), maxParamLength: 4096 }),
    // rawBody: keep the exact request bytes on `req.rawBody` so provider
    // webhooks (Slack) can verify signatures over what was actually signed.
    { bufferLogs: true, rawBody: true },
  );

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // SCIM clients (Okta/Azure AD) send `content-type: application/json` on
  // bodyless DELETE/POST requests; Fastify's strict JSON parser then 400s on the
  // empty body. Strip a stale JSON content-type from genuinely empty requests so
  // the request is treated as bodyless. An onRequest hook avoids the
  // content-type-parser registration conflict with NestFastify's own parser.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (req, _reply, done: () => void) => {
    const len = req.headers['content-length'];
    const ct = req.headers['content-type'];
    if ((!len || len === '0') && typeof ct === 'string' && ct.includes('application/json')) {
      delete req.headers['content-type'];
    }
    done();
  });

  // CORS — allow the web dev server (3000) and any configured origin. In
  // prod a single allowed origin (custom domain) is set via env.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'if-match', 'x-draft-token'],
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`kpi-nexus-api listening on http://0.0.0.0:${port}`, 'Bootstrap');
}

void bootstrap();
