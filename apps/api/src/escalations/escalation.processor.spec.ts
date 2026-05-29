/**
 * EscalationProcessor unit tests. Drives process(job) with fakes.
 * Covers: OPEN guard (acknowledged alert → no dispatch); OPEN alert →
 * dispatch to the level's channels + enqueue the next level.
 */
import { describe, expect, test, vi } from 'vitest';
import type { Job } from 'bullmq';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { NotificationDispatcherService } from '../notifications/notification-dispatcher.service.js';
import { EscalationProcessor } from './escalation.processor.js';
import type { EscalationsService, EscalationJobData } from './escalations.service.js';

function makeProcessor(opts: {
  alertStatus: string;
  alertRuleId?: string | null;
  levels?: unknown[];
}) {
  const prisma = {
    alert: {
      findFirst: vi.fn(async () => ({
        id: 'a1',
        status: opts.alertStatus,
        alertRuleId: opts.alertRuleId === undefined ? 'rule1' : opts.alertRuleId,
        kpiId: 'k1',
        targetUserId: null,
      })),
    },
    escalationRule: {
      findFirst: vi.fn(async () => (opts.levels ? { levels: opts.levels } : null)),
    },
    user: { findMany: vi.fn(async () => []) },
  };
  const dispatcher = {
    dispatch: vi.fn(async (_p: { channelIds: string[]; organizationId: string; alertId: string }) => [] as string[]),
  };
  const realtime = { publish: vi.fn(async () => {}) };
  const escalations = { enqueueLevel: vi.fn(async () => {}) };

  const processor = new EscalationProcessor(
    prisma as unknown as PrismaService,
    dispatcher as unknown as NotificationDispatcherService,
    realtime as unknown as RealtimeService,
    escalations as unknown as EscalationsService,
  );
  return { processor, prisma, dispatcher, realtime, escalations };
}

const job = (level: number): Job<EscalationJobData> =>
  ({ data: { alertId: 'a1', organizationId: 'org_1', level } }) as Job<EscalationJobData>;

describe('EscalationProcessor', () => {
  test('OPEN guard — acknowledged alert is not escalated', async () => {
    const h = makeProcessor({ alertStatus: 'ACKNOWLEDGED', levels: [{ delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] }] });
    await h.processor.process(job(0));
    expect(h.dispatcher.dispatch).not.toHaveBeenCalled();
    expect(h.realtime.publish).not.toHaveBeenCalled();
  });

  test('OPEN alert → dispatch to level channels + publish + enqueue next level', async () => {
    const h = makeProcessor({
      alertStatus: 'OPEN',
      levels: [
        { delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] },
        { delayMinutes: 5, channelIds: ['ch2'], notifyRoleIds: [], notifyUserIds: [] },
      ],
    });
    await h.processor.process(job(0));
    expect(h.dispatcher.dispatch).toHaveBeenCalledOnce();
    const arg = h.dispatcher.dispatch.mock.calls[0]![0] as { channelIds: string[] };
    expect(arg.channelIds).toEqual(['ch1']);
    expect(h.realtime.publish).toHaveBeenCalledOnce();
    // Next level (5 min) scheduled.
    expect(h.escalations.enqueueLevel).toHaveBeenCalledWith('a1', 'org_1', 1, 5 * 60_000);
  });

  test('last level → no next-level enqueue', async () => {
    const h = makeProcessor({
      alertStatus: 'OPEN',
      levels: [{ delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] }],
    });
    await h.processor.process(job(0));
    expect(h.escalations.enqueueLevel).not.toHaveBeenCalled();
  });

  test('no escalation policy → no-op', async () => {
    const h = makeProcessor({ alertStatus: 'OPEN', levels: undefined });
    await h.processor.process(job(0));
    expect(h.dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
