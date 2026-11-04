import { Subject } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { RealtimeController } from './realtime.controller.js';
import type { RealtimeService } from './realtime.service.js';

// BE-028: the SSE handler hijacks the reply and writes to reply.raw, which
// skips Fastify's send pipeline — so headers prepared by hooks (notably
// @fastify/cors's Access-Control-Allow-Origin) were never sent and every
// browser blocked the stream. They must be copied onto raw before flushing.
describe('RealtimeController.stream — keeps hook-set headers (BE-028)', () => {
  test('CORS headers prepared on the reply reach the raw stream, before headers are flushed', () => {
    const events: string[] = [];
    const rawHeaders: Record<string, unknown> = {};
    const raw = {
      writableEnded: false,
      setHeader: vi.fn((k: string, v: unknown) => {
        rawHeaders[k.toLowerCase()] = v;
        events.push(`set:${k.toLowerCase()}`);
      }),
      flushHeaders: vi.fn(() => events.push('flush')),
      write: vi.fn(),
      end: vi.fn(),
    };
    const reply = {
      hijack: vi.fn(),
      raw,
      getHeaders: () => ({
        'access-control-allow-origin': 'http://localhost:3000',
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      }),
    } as unknown as FastifyReply;
    const req = { query: {}, raw: { on: vi.fn() } } as unknown as FastifyRequest;
    const service = { subscribe: vi.fn(() => new Subject()) } as unknown as RealtimeService;

    RequestContextStore.run({ userId: 'u1', organizationId: 'org_a', roleId: null, principalType: 'user' }, () =>
      new RealtimeController(service).stream(req, reply),
    );

    expect(rawHeaders['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(rawHeaders['access-control-allow-credentials']).toBe('true');
    expect(rawHeaders['content-type']).toBe('text/event-stream');
    expect(events.indexOf('set:access-control-allow-origin')).toBeLessThan(events.indexOf('flush'));
  });
});
