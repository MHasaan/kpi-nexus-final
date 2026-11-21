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
  /** People named on a level, with their addresses. */
  people?: Array<{ id: string; email: string }>;
  /** Addresses the level's email channels already send to. */
  channelAddresses?: string[];
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
    user: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; roleId?: unknown } }) =>
        where.id ? (opts.people ?? []).filter((p) => where.id!.in.includes(p.id)) : [],
      ),
    },
  };
  const dispatcher = {
    dispatchToPeople: vi.fn(async () => []),
    dispatch: vi.fn(async (_p: { channelIds: string[]; organizationId: string; alertId: string }) => [] as string[]),
    emailAddressesOf: vi.fn(async () => new Set(opts.channelAddresses ?? [])),
  };
  const realtime = { publish: vi.fn(async () => {}) };
  const escalations = { enqueueLevel: vi.fn(async () => {}) };
  const digest = { enqueueDigest: vi.fn(async (_o: string, _u: string) => {}) };

  const processor = new EscalationProcessor(
    prisma as unknown as PrismaService,
    dispatcher as unknown as NotificationDispatcherService,
    realtime as unknown as RealtimeService,
    escalations as unknown as EscalationsService,
    digest as unknown as import('../notifications/notification-digest.service.js').NotificationDigestService,
  );
  return { processor, prisma, dispatcher, realtime, escalations, digest };
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

// Manual QA (2026-11-19, F-034): Olivia, named on the level and also an address on its email channel, got the
// alert twice. Someone the channel already reaches is not emailed separately.
describe('EscalationProcessor — no two copies for one person', () => {
  test('a person whose address is on the level\'s email channel is left out of the personal emails', async () => {
    const { processor, dispatcher, digest } = makeProcessor({
      alertStatus: 'OPEN',
      levels: [{ delayMinutes: 0, channelIds: ['ch_finance'], notifyRoleIds: [], notifyUserIds: ['u_olivia', 'u_priya'] }],
      people: [
        { id: 'u_olivia', email: 'Olivia@Example.test' },
        { id: 'u_priya', email: 'priya@example.test' },
      ],
      channelAddresses: ['olivia@example.test', 'cfo@example.test'],
    });

    await processor.process(job(0));

    expect(dispatcher.emailAddressesOf).toHaveBeenCalledWith(['ch_finance']);
    expect(dispatcher.dispatchToPeople).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u_priya'] }));
    // Both still get the alert in the app and in their digest.
    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ channelIds: ['ch_finance'], includeInApp: true }));
    expect(digest.enqueueDigest.mock.calls.map((c) => c[1]).sort()).toEqual(['u_olivia', 'u_priya']);
  });
});
