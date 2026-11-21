/**
 * Flow walk (alerts): an alert's page listed what was sent as "In-app" twice —
 * one of the two was an email to a person. A delivery was given to the page
 * without how it went (`kind`) or why it is still waiting (`held`), so the
 * page could not say.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import type { NotificationDispatcherService } from './notification-dispatcher.service.js';
import { NotificationDeliveriesService } from './notification-deliveries.service.js';

const ctx: RequestContext = { userId: 'u1', organizationId: 'org_alpha', roleId: null, principalType: 'user' };

describe('NotificationDeliveriesService.list', () => {
  test('a delivery says how it went out and why it may still be waiting, within the caller\'s organisation', async () => {
    const findMany = vi.fn(async (_args: { where: Record<string, unknown>; select: Record<string, boolean> }) => []);
    const service = new NotificationDeliveriesService(
      { notificationDelivery: { findMany } } as unknown as PrismaService,
      {} as NotificationDispatcherService,
    );
    await RequestContextStore.run(ctx, () => service.list({ alertId: 'alert_1' }));
    const { where, select } = findMany.mock.calls[0]![0];
    expect(where).toMatchObject({ organizationId: 'org_alpha', alertId: 'alert_1' });
    expect(select).toMatchObject({ channelId: true, targetUserId: true, kind: true, held: true, status: true });
  });
});

// Manual QA (2026-11-20, F-070): the failed-deliveries page showed only a truncated delivery id, not which
// alert or channel failed. Each row now carries the KPI, the alert's message and the channel's name.
describe('NotificationDeliveriesService.list names what failed', () => {
  test('a row carries its KPI, alert message and channel name; one without a channel says so', async () => {
    const rows = [
      { id: 'd1', organizationId: 'org_alpha', alertId: 'a1', channelId: 'c1', targetUserId: null, kind: null, held: null, status: 'FAILED', attempts: 2, error: 'fetch failed', sentAt: null, createdAt: new Date() },
      { id: 'd2', organizationId: 'org_alpha', alertId: 'a1', channelId: null, targetUserId: 'u1', kind: 'EMAIL', held: null, status: 'FAILED', attempts: 1, error: 'bounced', sentAt: null, createdAt: new Date() },
    ];
    const prisma = {
      notificationDelivery: { findMany: vi.fn(async () => rows) },
      notificationChannel: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; organizationId: string } }) => (where.organizationId === 'org_alpha' && where.id.in.includes('c1') ? [{ id: 'c1', name: 'QA broken webhook' }] : [])) },
      alert: { findMany: vi.fn(async () => [{ id: 'a1', message: 'NPS fell to 5', kpiId: 'k1' }]) },
      kPI: { findMany: vi.fn(async () => [{ id: 'k1', name: 'Net Promoter Score' }]) },
    };
    const service = new NotificationDeliveriesService(prisma as unknown as PrismaService, {} as NotificationDispatcherService);
    const out = await RequestContextStore.run(ctx, () => service.list({ status: 'FAILED' }));
    expect(out[0]).toMatchObject({ id: 'd1', channelName: 'QA broken webhook', kpiName: 'Net Promoter Score', alertMessage: 'NPS fell to 5' });
    expect(out[1]).toMatchObject({ id: 'd2', channelName: null, kpiName: 'Net Promoter Score', alertMessage: 'NPS fell to 5' });
  });
});
