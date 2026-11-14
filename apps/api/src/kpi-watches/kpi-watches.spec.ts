/**
 * Watching a KPI (KPIWatch, spec §4). A watcher picks the events they want;
 * when one happens a background job raises a personal LOW alert for each
 * watcher, checked AS THAT WATCHER: the KPI must still be visible to them and,
 * for a new value, the point must be in their point scope. The person who
 * caused the event is not told, and the alert never carries the value (alerts
 * are visible beyond their target), only that something happened.
 */
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiWatchProcessor } from './kpi-watch.processor.js';
import type { KpiWatchJobData } from './kpi-watch.producer.js';
import { KpiWatchesService } from './kpi-watches.service.js';

const ORG = 'org_1';
const as = <T>(userId: string, fn: () => Promise<T>) =>
  RequestContextStore.run({ userId, organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;

describe('KpiWatchesService', () => {
  function make(visible = true) {
    const rows: Array<Record<string, unknown>> = [];
    const prisma = {
      kPIWatch: {
        upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = rows.find((r) => r.userId === create.userId && r.kpiId === create.kpiId);
          if (existing) return Object.assign(existing, update);
          const row = { id: `w${rows.length + 1}`, ...create };
          rows.push(row);
          return row;
        }),
        deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const before = rows.length;
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.userId === where.userId && rows[i]!.kpiId === where.kpiId) rows.splice(i, 1);
          return { count: before - rows.length };
        }),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => r.userId === where.userId && r.kpiId === where.kpiId) ?? null),
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => r.userId === where.userId)),
      },
    };
    const accessContext = { isKpiVisible: vi.fn(async () => visible) };
    const svc = new KpiWatchesService(prisma as unknown as PrismaService, accessContext as unknown as AccessContextService);
    return { svc, rows };
  }

  it('watch, change the events, stop watching', async () => {
    const { svc, rows } = make();
    await as('me', () => svc.watch('k1', ['threshold_breached']));
    await as('me', () => svc.watch('k1', ['threshold_breached', 'status_changed']));
    expect(rows).toEqual([expect.objectContaining({ organizationId: ORG, userId: 'me', kpiId: 'k1', events: ['threshold_breached', 'status_changed'] })]);
    expect(await as('me', () => svc.get('k1'))).toMatchObject({ watching: true, events: ['threshold_breached', 'status_changed'] });
    await as('me', () => svc.unwatch('k1'));
    expect(await as('me', () => svc.get('k1'))).toEqual({ watching: false, events: [] });
  });

  it('a KPI the caller cannot see cannot be watched (404)', async () => {
    const { svc } = make(false);
    await expect(as('me', () => svc.watch('k1', ['status_changed']))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('KpiWatchProcessor', () => {
  function make(opts: { visibleTo?: string[]; pointScope?: Record<string, object>; watches?: Array<{ userId: string; events: string[] }> } = {}) {
    const alerts: Array<Record<string, unknown>> = [];
    const asWho: string[] = [];
    const prisma = {
      kPIWatch: {
        findMany: vi.fn(async ({ where }: { where: { kpiId: string; events: { has: string } } }) =>
          (opts.watches ?? [{ userId: 'w1', events: ['data_point_added', 'status_changed'] }]).filter((w) => w.events.includes(where.events.has)),
        ),
      },
      user: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, roleId: `role_${where.id}` })) },
      kPI: { findFirst: vi.fn(async () => ({ id: 'k1', name: 'Calls made', scope: 'PER_USER' })) },
      alert: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `a${alerts.length + 1}`, createdAt: new Date(), ...data };
          alerts.push(row);
          return row;
        }),
      },
    };
    const accessContext = {
      isKpiVisible: vi.fn(async () => {
        const who = RequestContextStore.get()!.userId;
        asWho.push(who);
        return (opts.visibleTo ?? ['w1', 'w2']).includes(who);
      }),
      kpiPointScopeWhere: vi.fn(async () => (opts.pointScope ?? {})[RequestContextStore.get()!.userId] ?? {}),
    };
    const realtime = { publish: vi.fn(async () => {}) };
    const processor = new KpiWatchProcessor(prisma as unknown as PrismaService, accessContext as unknown as AccessContextService, realtime as unknown as RealtimeService);
    return { processor, alerts, asWho, realtime };
  }
  const job = (data: Partial<KpiWatchJobData>) => ({ data: { organizationId: ORG, kpiId: 'k1', event: 'data_point_added', actorUserId: null, ...data } }) as { data: KpiWatchJobData };

  it('raises a LOW alert targeted at each watcher of that event, checked as the watcher, without the value', async () => {
    const { processor, alerts, asWho, realtime } = make({ watches: [{ userId: 'w1', events: ['data_point_added'] }, { userId: 'w2', events: ['status_changed'] }] });
    await processor.process(job({ event: 'data_point_added', pointUserId: 'u9' }) as never);
    expect(alerts).toEqual([expect.objectContaining({ organizationId: ORG, kpiId: 'k1', targetUserId: 'w1', severity: 'LOW', alertRuleId: null, status: 'OPEN', isPersonal: true })]);
    expect(String(alerts[0]!.message)).toBe('Watching: a new value was recorded for Calls made');
    expect(asWho).toEqual(['w1']);
    expect(realtime.publish).toHaveBeenCalledWith(ORG, expect.objectContaining({ type: 'alert_triggered', kpiId: 'k1', severity: 'LOW' }));
  });

  it('the person who caused the event is not told', async () => {
    const { processor, alerts } = make({ watches: [{ userId: 'w1', events: ['status_changed'] }] });
    await processor.process(job({ event: 'status_changed', actorUserId: 'w1', detail: 'ACTIVE' }) as never);
    expect(alerts).toEqual([]);
  });

  it('a watcher who can no longer see the KPI is skipped', async () => {
    const { processor, alerts } = make({ visibleTo: [], watches: [{ userId: 'w1', events: ['status_changed'] }] });
    await processor.process(job({ event: 'status_changed', detail: 'PAUSED' }) as never);
    expect(alerts).toEqual([]);
  });

  it("a new value outside the watcher's point scope is not announced to them", async () => {
    const { processor, alerts } = make({
      watches: [{ userId: 'w1', events: ['data_point_added'] }, { userId: 'w2', events: ['data_point_added'] }],
      pointScope: { w1: { userId: { in: ['w1'] } }, w2: { userId: { in: ['w2', 'u9'] } } },
    });
    await processor.process(job({ event: 'data_point_added', pointUserId: 'u9' }) as never);
    expect(alerts.map((a) => a.targetUserId)).toEqual(['w2']);
  });

  it('messages for the other events', async () => {
    const { processor, alerts } = make({ watches: [{ userId: 'w1', events: ['status_changed', 'threshold_breached', 'anomaly_confirmed'] }] });
    await processor.process(job({ event: 'status_changed', detail: 'PAUSED' }) as never);
    await processor.process(job({ event: 'threshold_breached' }) as never);
    await processor.process(job({ event: 'anomaly_confirmed' }) as never);
    expect(alerts.map((a) => a.message)).toEqual([
      'Watching: Calls made is now PAUSED',
      'Watching: an alert rule fired for Calls made',
      'Watching: an anomaly was confirmed on Calls made',
    ]);
  });
});
