import { BadRequestException, Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { RealtimeStreamQuerySchema } from '@kpi-nexus/contracts';

import { RequestContextStore } from '../tenancy/request-context.js';
import { RealtimeService } from './realtime.service.js';

/**
 * GET /realtime/stream
 *
 * Server-Sent Events endpoint — authed (global JwtAuthGuard + TenancyInterceptor
 * populate RequestContextStore before this handler runs; do NOT add @Public()).
 *
 * The handler calls `reply.hijack()` before writing to `reply.raw` so that
 * Nest/Fastify do not attempt to send their own response after the handler
 * returns. The method intentionally returns no value (undefined); the SSE
 * connection is kept alive by the open writable stream until the client
 * disconnects.
 *
 * Query params:
 *   kpiId       (optional) — filter events to this KPI
 *   dashboardId (optional) — filter events to this dashboard
 */
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('stream')
  stream(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): void {
    // Validate query params
    const queryResult = RealtimeStreamQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: { issues: queryResult.error.issues },
      });
    }
    const filters = queryResult.data;

    // Get org from tenant context (populated by TenancyInterceptor post-JWT)
    const { organizationId: orgId } = RequestContextStore.require();

    // Hijack the Fastify reply so Nest/Fastify leave the raw stream alone
    reply.hijack();

    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    // Disable nginx/proxy buffering so events flush immediately
    raw.setHeader('X-Accel-Buffering', 'no');
    raw.flushHeaders();

    // Heartbeat every 25 s — keeps proxies from closing idle connections
    const heartbeat = setInterval(() => {
      if (!raw.writableEnded) {
        raw.write(':heartbeat\n\n');
      }
    }, 25_000);

    // Subscribe to realtime events for this org
    const subscription = this.realtimeService.subscribe(orgId, filters).subscribe({
      next: (event) => {
        if (raw.writableEnded) return;
        // SSE wire format: "event: <type>\ndata: <json>\n\n"
        raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      },
      error: (err: unknown) => {
        // On subscription error, close the stream cleanly
        clearInterval(heartbeat);
        if (!raw.writableEnded) {
          raw.end();
        }
        // Log but do not rethrow — the HTTP response is already gone
        void err; // referenced to satisfy linter
      },
    });

    // Cleanup when the client closes the connection
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      if (!raw.writableEnded) {
        raw.end();
      }
    });
  }
}
