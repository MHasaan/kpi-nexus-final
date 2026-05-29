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
    alert: {
      findUnique: vi.fn(async () => ({
        id: 'a1', kpiId: 'k1', severity: 'HIGH', message: 'breach',
      })),
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
