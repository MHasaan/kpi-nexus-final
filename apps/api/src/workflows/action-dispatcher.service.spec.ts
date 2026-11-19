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

function makeService(openTask: { id: string } | null = null) {
  const tasks = { create: vi.fn(async (_input: Record<string, unknown>, _origin?: { workflowId: string }) => ({ id: 'task_1' })) };
  const webhooks = { dispatchEvent: vi.fn(async (_org: string, _event: string, _payload: unknown) => {}) };
  const email = { send: vi.fn(async () => {}) };
  const prisma = {
    task: { findFirst: vi.fn(async (_args: unknown) => openTask) },
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

  // A task made by an automation used to arrive with a title and nothing else:
  // nobody opening it could tell why it existed or what had happened.
  test('a task made by an automation says which one made it and the value that set it off', async () => {
    const { service, tasks } = makeService();
    await withCtx(() =>
      service.dispatch({ kind: 'create_task', title: 'Review revenue' }, { kind: 'kpi_changed', kpiId: 'k', value: 35000 }, NOW, { name: 'Revenue dip' }),
    );
    const arg = tasks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.description).toBe('Made by the automation "Revenue dip" when a value of 35000 was recorded.');
  });

  test('run by hand, it says so instead of naming a value nobody recorded', async () => {
    const { service, tasks } = makeService();
    await withCtx(() =>
      service.run({ kind: 'create_task', title: 'Review revenue' }, { kind: 'kpi_changed', kpiId: 'k', value: 35000 }, NOW, { name: 'Revenue dip', byHand: true }),
    );
    const arg = tasks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.description).toBe('Made by the automation "Revenue dip", run by hand.');
  });

  test("a description the automation was given comes first, with where the task came from after it", async () => {
    const { service, tasks } = makeService();
    await withCtx(() =>
      service.dispatch(
        { kind: 'create_task', title: 'T', description: 'Call the top five accounts.' },
        { kind: 'alert', severity: 'HIGH' },
        NOW,
        { name: 'Big alerts' },
      ),
    );
    const arg = tasks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.description).toBe('Call the top five accounts.\n\nMade by the automation "Big alerts" when an alert was raised.');
  });

  // Three low months used to give three identical tasks. An automation now waits
  // for the task it made to be closed before it makes another.
  describe('holding back while its last task is still open', () => {
    const action = { kind: 'create_task', title: 'Review revenue' } as const;
    const event = { kind: 'kpi_changed', kpiId: 'k', value: 1 } as const;
    const source = { id: 'wf_1', name: 'Revenue dip' };

    test('a task it makes is marked as its own', async () => {
      const { service, tasks } = makeService();
      await expect(withCtx(() => service.dispatch(action, event, NOW, source))).resolves.toBe('done');
      expect(tasks.create.mock.calls[0]![1]).toEqual({ workflowId: 'wf_1' });
    });

    test('with one of its tasks still open it makes no other, and says it held back', async () => {
      const { service, tasks, prisma } = makeService({ id: 'task_open' });
      await expect(withCtx(() => service.dispatch(action, event, NOW, source))).resolves.toBe('held');
      expect(tasks.create).not.toHaveBeenCalled();
      // Only this organisation's tasks, only this automation's, only the ones not finished.
      expect(prisma.task.findFirst.mock.calls[0]![0]).toMatchObject({
        where: { organizationId: ORG, workflowId: 'wf_1', status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
      });
    });

    test('run by hand it makes the task anyway: a person asked for it', async () => {
      const { service, tasks } = makeService({ id: 'task_open' });
      await expect(withCtx(() => service.run(action, event, NOW, { ...source, byHand: true }))).resolves.toBe('done');
      expect(tasks.create).toHaveBeenCalledTimes(1);
    });
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
    ).resolves.toBe('failed');
  });
});
