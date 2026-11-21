/**
 * NotificationDispatcherService.attemptDelivery unit tests.
 * Fakes Prisma, adapters, and the retry queue. Covers: success → SENT;
 * retryable failure → FAILED + retry scheduled; non-retryable → terminal
 * (no retry); max attempts → terminal.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import {
  NotificationAdaptersService,
  NonRetryableDeliveryError,
} from './notification-adapters.service.js';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';

interface FakeDelivery {
  id: string;
  organizationId: string;
  alertId: string;
  channelId: string | null;
  attempts: number;
  status: string;
  error: string | null;
  sentAt: Date | null;
  kind?: string | null;
  targetUserId?: string | null;
}

function makeHarness(opts: {
  delivery: Partial<FakeDelivery>;
  channel?: { kind: string; config: unknown; isActive: boolean } | null;
  sendImpl?: () => Promise<void>;
}) {
  const delivery: FakeDelivery = {
    id: 'd1',
    organizationId: 'org_1',
    alertId: 'a1',
    channelId: null,
    attempts: 0,
    status: 'PENDING',
    error: null,
    sentAt: null,
    ...opts.delivery,
  };

  const prisma = {
    notificationDelivery: {
      findUnique: vi.fn(async () => ({ ...delivery })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(delivery, data);
        return { ...delivery };
      }),
    },
    // Whose alert it is, for the email's header.
    organization: {
      findUnique: vi.fn(async () => ({ name: 'Alpha Inc', logoUrl: null, primaryColor: null })),
    },
    alert: {
      findUnique: vi.fn(async () => ({
        id: 'a1', kpiId: 'k1', severity: 'HIGH', message: 'breach',
        alertRule: { name: 'MRR below 230k floor', description: 'Check pipeline with Sales, then brief the CFO' },
      })),
    },
    kPI: {
      findUnique: vi.fn(async () => ({ name: 'Monthly Recurring Revenue' })),
    },
    notificationChannel: {
      findUnique: vi.fn(async () => opts.channel ?? null),
    },
  };

  const adapters = {
    send: vi.fn(opts.sendImpl ?? (async () => {})),
  };
  const retryQueue = { add: vi.fn(async () => ({})) };

  const dispatcher = new NotificationDispatcherService(
    prisma as unknown as PrismaService,
    adapters as unknown as NotificationAdaptersService,
    retryQueue as unknown as never,
  );
  return { dispatcher, delivery, prisma, adapters, retryQueue };
}

describe('NotificationDispatcherService.attemptDelivery', () => {
  test('IN_APP success → status SENT, no retry', async () => {
    const h = makeHarness({ delivery: { channelId: null } });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.delivery.status).toBe('SENT');
    expect(h.delivery.attempts).toBe(1);
    expect(h.retryQueue.add).not.toHaveBeenCalled();
  });

  test('retryable failure → FAILED + retry scheduled', async () => {
    const h = makeHarness({
      delivery: { channelId: 'ch1', attempts: 0 },
      channel: { kind: 'SLACK', config: 'v1.a.b.c', isActive: true },
      sendImpl: async () => {
        throw new Error('502 upstream');
      },
    });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.delivery.status).toBe('FAILED');
    expect(h.retryQueue.add).toHaveBeenCalledOnce();
  });

  test('non-retryable (4xx) failure → terminal FAILED, no retry', async () => {
    const h = makeHarness({
      delivery: { channelId: 'ch1', attempts: 0 },
      channel: { kind: 'SLACK', config: 'v1.a.b.c', isActive: true },
      sendImpl: async () => {
        throw new NonRetryableDeliveryError('400 bad');
      },
    });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.delivery.status).toBe('FAILED');
    expect(h.retryQueue.add).not.toHaveBeenCalled();
  });

  test('max attempts reached → terminal FAILED, no further retry', async () => {
    const h = makeHarness({
      delivery: { channelId: 'ch1', attempts: 3 }, // 4th attempt = MAX
      channel: { kind: 'SLACK', config: 'v1.a.b.c', isActive: true },
      sendImpl: async () => {
        throw new Error('still failing');
      },
    });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.delivery.status).toBe('FAILED');
    expect(h.delivery.attempts).toBe(4);
    expect(h.retryQueue.add).not.toHaveBeenCalled();
  });

  test('already SENT delivery is not re-sent (idempotent)', async () => {
    const h = makeHarness({ delivery: { status: 'SENT', channelId: null } });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.adapters.send).not.toHaveBeenCalled();
  });

  test('inactive channel → FAILED without calling the adapter', async () => {
    const h = makeHarness({
      delivery: { channelId: 'ch1' },
      channel: { kind: 'SLACK', config: 'v1.a.b.c', isActive: false },
    });
    await h.dispatcher.attemptDelivery('d1');
    expect(h.delivery.status).toBe('FAILED');
    expect(h.adapters.send).not.toHaveBeenCalled();
  });
});

// Manual QA (2026-11-19, F-034 / F-035): every notification was titled "KPI Alert" and carried only the
// message. The payload now names the KPI and the rule, carries the rule's "what to do" and a link to the alert.
describe('NotificationDispatcherService — what a notification says', () => {
  test('the payload names the KPI in its title, the rule, what to do, and where the alert is', async () => {
    const { dispatcher, adapters } = makeHarness({ delivery: { kind: 'EMAIL', targetUserId: 'u1' } });
    (dispatcher as unknown as { prisma: { user: unknown } }).prisma.user = {
      findUnique: vi.fn(async () => ({ email: 'olivia@example.test', status: 'ACTIVE' })),
    };

    await dispatcher.attemptDelivery('d1');

    expect(adapters.send).toHaveBeenCalledTimes(1);
    const payload = (adapters.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).toMatchObject({
      title: 'High alert: Monthly Recurring Revenue',
      kpiName: 'Monthly Recurring Revenue',
      ruleName: 'MRR below 230k floor',
      runbook: 'Check pipeline with Sales, then brief the CFO',
    });
    expect(payload.link).toMatch(/\/alerts\/a1$/);
  });

  test('an alert raised without a rule, on a KPI that cannot be read, is still sent', async () => {
    const { dispatcher, adapters, prisma } = makeHarness({ delivery: { kind: 'EMAIL', targetUserId: 'u1' } });
    prisma.alert.findUnique = vi.fn(async () => ({ id: 'a1', kpiId: 'k1', severity: 'LOW', message: 'breach', alertRule: null })) as never;
    (prisma as unknown as { kPI: { findUnique: unknown } }).kPI.findUnique = vi.fn(async () => null);
    (dispatcher as unknown as { prisma: { user: unknown } }).prisma.user = {
      findUnique: vi.fn(async () => ({ email: 'olivia@example.test', status: 'ACTIVE' })),
    };

    await dispatcher.attemptDelivery('d1');

    const payload = (adapters.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![2] as Record<string, unknown>;
    expect(payload.title).toBe('Low alert');
    expect(payload.ruleName).toBeNull();
    expect(payload.runbook).toBeNull();
  });
});
