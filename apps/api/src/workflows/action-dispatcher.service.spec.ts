/**
 * ActionDispatcher unit tests. Routes a workflow action to the right side
 * effect: create_task → TasksService; post_webhook → WebhooksService;
 * send_notification → EmailService (for email channels). Covers each kind plus
 * dueAtRelativeHours math and unknown-kind fail-soft.
 */
import { describe, expect, test, vi } from 'vitest';

import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { WebhooksService } from '../webhooks/webhooks.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ActionDispatcherService } from './action-dispatcher.service.js';

const ORG = 'org_alpha';
const NOW = new Date('2026-05-30T00:00:00.000Z');

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const tasks = { create: vi.fn(async (_input: Record<string, unknown>) => ({ id: 'task_1' })) };
  const webhooks = { dispatchEvent: vi.fn(async (_org: string, _event: string, _payload: unknown) => {}) };
  const email = { send: vi.fn(async () => {}) };
  const prisma = {
    notificationChannel: {
      findFirst: vi.fn(async () => ({ id: 'ch_1', kind: 'EMAIL', config: { recipients: ['ops@x.test'] } })),
    },
  };
  const service = new ActionDispatcherService(
    tasks as unknown as TasksService,
    webhooks as unknown as WebhooksService,
    email as unknown as EmailService,
    prisma as unknown as PrismaService,
  );
  return { service, tasks, webhooks, email, prisma };
}

describe('ActionDispatcherService.dispatch', () => {
  test('create_task creates a task with the linked KPI and relative due date', async () => {
    const { service, tasks } = makeService();
    await withCtx(() =>
      service.dispatch(
        { kind: 'create_task', title: 'Investigate spike', priority: 'HIGH', dueAtRelativeHours: 24 },
        { kind: 'kpi_changed', kpiId: 'kpi_7', value: 150 },
        NOW,
      ),
    );
    expect(tasks.create).toHaveBeenCalledTimes(1);
    const arg = tasks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.title).toBe('Investigate spike');
    expect(arg.priority).toBe('HIGH');
    expect(arg.kpiId).toBe('kpi_7');
    expect((arg.dueAt as Date).toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  test('create_task without dueAtRelativeHours has no dueAt', async () => {
    const { service, tasks } = makeService();
    await withCtx(() => service.dispatch({ kind: 'create_task', title: 'T' }, { kind: 'kpi_changed', kpiId: 'k', value: 1 }, NOW));
    const arg = tasks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.dueAt).toBeUndefined();
  });

  test('post_webhook dispatches a workflow event', async () => {
    const { service, webhooks } = makeService();
    await withCtx(() =>
      service.dispatch({ kind: 'post_webhook', subscriptionId: 'sub_1' }, { kind: 'kpi_changed', kpiId: 'k', value: 1 }, NOW),
    );
    expect(webhooks.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(webhooks.dispatchEvent.mock.calls[0]![0]).toBe(ORG);
  });

  test('send_notification emails the channel recipients', async () => {
    const { service, email } = makeService();
    await withCtx(() =>
      service.dispatch(
        { kind: 'send_notification', channelId: 'ch_1', message: 'KPI breached' },
        { kind: 'kpi_changed', kpiId: 'k', value: 1 },
        NOW,
      ),
    );
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  test('unknown action kind is a fail-soft no-op (no throw)', async () => {
    const { service } = makeService();
    await expect(
      withCtx(() => service.dispatch({ kind: 'nonsense' } as never, { kind: 'kpi_changed', kpiId: 'k', value: 1 }, NOW)),
    ).resolves.toBeUndefined();
  });
});
