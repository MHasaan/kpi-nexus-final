import { Subject } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import { NotFoundException } from '@nestjs/common';

import type { DashboardsService } from '../dashboards/dashboards.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { RealtimeAccessService } from './realtime-access.service.js';
import { RealtimeController } from './realtime.controller.js';
import type { RealtimeService } from './realtime.service.js';

const allowAll = { forSubscriber: () => ({ allows: async () => true }) } as unknown as RealtimeAccessService;
const noDashboards = { getById: vi.fn() } as unknown as DashboardsService;
const ctx = { userId: 'u1', organizationId: 'org_a', roleId: null, principalType: 'user' } as const;

// BE-028: the SSE handler hijacks the reply and writes to reply.raw, which
// skips Fastify's send pipeline — so headers prepared by hooks (notably
// @fastify/cors's Access-Control-Allow-Origin) were never sent and every
// browser blocked the stream. They must be copied onto raw before flushing.
describe('RealtimeController.stream — keeps hook-set headers (BE-028)', () => {
  test('CORS headers prepared on the reply reach the raw stream, before headers are flushed', async () => {
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

    await RequestContextStore.run(ctx, () => new RealtimeController(service, allowAll, noDashboards).stream(req, reply));

    expect(rawHeaders['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(rawHeaders['access-control-allow-credentials']).toBe('true');
    expect(rawHeaders['content-type']).toBe('text/event-stream');
    expect(events.indexOf('set:access-control-allow-origin')).toBeLessThan(events.indexOf('flush'));
  });
});

describe('RealtimeController.stream — per-subscriber filter', () => {
  test('only events the subscriber may read are written to the stream', async () => {
    const raw = { writableEnded: false, setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn() };
    const reply = { hijack: vi.fn(), raw, getHeaders: () => ({}) } as unknown as FastifyReply;
    const req = { query: {}, raw: { on: vi.fn() } } as unknown as FastifyRequest;
    const events = new Subject<{ type: string; userId?: string }>();
    const service = { subscribe: vi.fn(() => events) } as unknown as RealtimeService;
    const access = {
      forSubscriber: () => ({ allows: async (e: { userId?: string }) => e.userId === 'u1' }),
    } as unknown as RealtimeAccessService;

    await RequestContextStore.run(ctx, () => new RealtimeController(service, access, noDashboards).stream(req, reply));
    events.next({ type: 'alert_digest', userId: 'u1' });
    events.next({ type: 'alert_digest', userId: 'someone-else' });
    await new Promise((r) => setTimeout(r, 0));

    const written = raw.write.mock.calls.map((c) => String(c[0])).filter((w) => w.startsWith('event:'));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('"userId":"u1"');
  });
});

// UI-006: a dashboard subscription is scoped to the KPIs on that dashboard.
describe('RealtimeController.stream — ?dashboardId=', () => {
  const stream = () => {
    const raw = { writableEnded: false, setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn() };
    const reply = { hijack: vi.fn(), raw, getHeaders: () => ({}) } as unknown as FastifyReply;
    const req = { query: { dashboardId: 'dash-1' }, raw: { on: vi.fn() } } as unknown as FastifyRequest;
    return { reply, req };
  };

  test('the subscription is given the KPIs that dashboard shows', async () => {
    const { reply, req } = stream();
    const service = { subscribe: vi.fn(() => new Subject()) } as unknown as RealtimeService;
    const dashboards = {
      getById: vi.fn(async () => ({
        widgets: [
          { widgetType: 'kpi_card', config: { kpiId: 'kpi-a' } },
          { widgetType: 'line', config: { kpiId: 'kpi-b' } },
        ],
      })),
    } as unknown as DashboardsService;

    await RequestContextStore.run(ctx, () => new RealtimeController(service, allowAll, dashboards).stream(req, reply));

    expect(dashboards.getById).toHaveBeenCalledWith('dash-1');
    expect(service.subscribe).toHaveBeenCalledWith('org_a', { dashboardId: 'dash-1' }, new Set(['kpi-a', 'kpi-b']));
  });

  test('a dashboard the caller cannot see is a 404, and no stream is opened', async () => {
    const { reply, req } = stream();
    const service = { subscribe: vi.fn(() => new Subject()) } as unknown as RealtimeService;
    const dashboards = {
      getById: vi.fn(async () => {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
      }),
    } as unknown as DashboardsService;

    await expect(
      RequestContextStore.run(ctx, () => new RealtimeController(service, allowAll, dashboards).stream(req, reply)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reply.hijack).not.toHaveBeenCalled();
    expect(service.subscribe).not.toHaveBeenCalled();
  });

  test('with no dashboardId nothing is looked up', async () => {
    const { reply } = stream();
    const req = { query: {}, raw: { on: vi.fn() } } as unknown as FastifyRequest;
    const service = { subscribe: vi.fn(() => new Subject()) } as unknown as RealtimeService;
    const dashboards = { getById: vi.fn() } as unknown as DashboardsService;
    await RequestContextStore.run(ctx, () => new RealtimeController(service, allowAll, dashboards).stream(req, reply));
    expect(dashboards.getById).not.toHaveBeenCalled();
    expect(service.subscribe).toHaveBeenCalledWith('org_a', {}, undefined);
  });
});
