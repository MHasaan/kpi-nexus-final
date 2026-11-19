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
