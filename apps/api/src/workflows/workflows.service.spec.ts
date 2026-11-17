/**
 * WorkflowsService unit tests. CRUD is org-scoped; runEvent finds active
 * workflows subscribed to the trigger, evaluates each rule, and dispatches the
 * action only on a match (recording lastRunAt).
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import type { ActionDispatcherService } from './action-dispatcher.service.js';
import { WorkflowsService } from './workflows.service.js';

interface FakeWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  triggers: string[];
  rule: unknown;
  action: unknown;
  isActive: boolean;
  scheduleCron: string | null;
  lastRunAt: Date | null;
  createdById: string;
}

class FakePrisma {
  private n = 1;
  workflows: FakeWorkflow[] = [];
  /** What exists in each organisation, for the "does this id belong here" checks. */
  kpis = [{ id: 'mrr', organizationId: 'org_alpha' }, { id: 'theirs', organizationId: 'other' }];
  people = [{ id: 'sara', organizationId: 'org_alpha' }];
  channels = [{ id: 'email-1', organizationId: 'org_alpha' }];
  webhooks = [{ id: 'hook-1', organizationId: 'org_alpha' }];
  latest: { value: number } | null = null;

  private inOrg = (rows: Array<{ id: string; organizationId: string }>) =>
    vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      rows.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
    );
  kPI = { findFirst: this.inOrg(this.kpis) };
  user = { findFirst: this.inOrg(this.people) };
  notificationChannel = { findFirst: this.inOrg(this.channels) };
  webhookSubscription = { findFirst: this.inOrg(this.webhooks) };
  kPIDataPoint = { findFirst: vi.fn(async () => this.latest) };

  workflow = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.workflows.filter((w) => {
        if (w.organizationId !== where.organizationId) return false;
        if (where.isActive !== undefined && w.isActive !== where.isActive) return false;
        if (where.triggers && typeof where.triggers === 'object') {
          const has = (where.triggers as { has?: string }).has;
          if (has && !w.triggers.includes(has)) return false;
        }
        return true;
      }),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.workflows.find((w) => w.id === where.id && w.organizationId === where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const w: FakeWorkflow = {
        id: `wf_${this.n++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        triggers: (data.triggers as string[]) ?? [],
        rule: data.rule ?? null,
        action: data.action,
        isActive: (data.isActive as boolean) ?? true,
        scheduleCron: (data.scheduleCron as string) ?? null,
        lastRunAt: null,
        createdById: data.createdById as string,
      };
      this.workflows.push(w);
      return w;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const w = this.workflows.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (w as unknown as Record<string, unknown>)[k] = data[k];
      return w;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.workflows = this.workflows.filter((w) => w.id !== where.id);
      return {};
    }),
  };
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const dispatcher = { dispatch: vi.fn(async () => {}), run: vi.fn(async () => {}) };
  const audit = { record: vi.fn(async () => {}) };
  const service = new WorkflowsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    dispatcher as unknown as ActionDispatcherService,
  );
  return { service, prisma, dispatcher };
}

describe('WorkflowsService CRUD', () => {
  test('create + list org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ name: 'A', triggers: ['kpi_changed'], action: { kind: 'create_task', title: 'X' } }));
    await withCtx({ organizationId: 'other' }, () => service.create({ name: 'B', triggers: ['manual'], action: { kind: 'create_task', title: 'Y' } }));
    const rows = await withCtx({}, () => service.list());
    expect(rows.map((r) => r.name)).toEqual(['A']);
  });
});

describe('WorkflowsService.runEvent', () => {
  test('dispatches the action when the rule matches', async () => {
    const { service, prisma, dispatcher } = makeService();
    await withCtx({}, () =>
      service.create({
        name: 'celebrate',
        triggers: ['kpi_changed'],
        rule: { kind: 'kpi_value', kpiId: 'mrr', operator: '>', value: 100000 },
        action: { kind: 'create_task', title: 'Celebrate!' },
      }),
    );
    await withCtx({}, () => service.runEvent('kpi_changed', { kind: 'kpi_changed', kpiId: 'mrr', value: 150000 }));
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(prisma.workflows[0]!.lastRunAt).not.toBeNull();
  });

  test('does NOT dispatch when the rule does not match', async () => {
    const { service, dispatcher } = makeService();
    await withCtx({}, () =>
      service.create({
        name: 'celebrate',
        triggers: ['kpi_changed'],
        rule: { kind: 'kpi_value', kpiId: 'mrr', operator: '>', value: 100000 },
        action: { kind: 'create_task', title: 'Celebrate!' },
      }),
    );
    await withCtx({}, () => service.runEvent('kpi_changed', { kind: 'kpi_changed', kpiId: 'mrr', value: 50000 }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  test('ignores workflows not subscribed to the trigger', async () => {
    const { service, dispatcher } = makeService();
    await withCtx({}, () =>
      service.create({ name: 'sched', triggers: ['schedule'], action: { kind: 'create_task', title: 'X' } }),
    );
    await withCtx({}, () => service.runEvent('kpi_changed', { kind: 'kpi_changed', kpiId: 'k', value: 1 }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  test('inactive workflows are skipped', async () => {
    const { service, dispatcher } = makeService();
    const w = await withCtx({}, () =>
      service.create({ name: 'off', triggers: ['kpi_changed'], action: { kind: 'create_task', title: 'X' } }),
    );
    await withCtx({}, () => service.update(w.id, { isActive: false }));
    await withCtx({}, () => service.runEvent('kpi_changed', { kind: 'kpi_changed', kpiId: 'k', value: 1 }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  test('runEvent never throws even if a dispatch fails', async () => {
    const { service, dispatcher } = makeService();
    dispatcher.dispatch = vi.fn(async (): Promise<void> => {
      throw new Error('boom');
    });
    await withCtx({}, () =>
      service.create({ name: 'x', triggers: ['kpi_changed'], action: { kind: 'create_task', title: 'X' } }),
    );
    await expect(
      withCtx({}, () => service.runEvent('kpi_changed', { kind: 'kpi_changed', kpiId: 'k', value: 1 })),
    ).resolves.toBeUndefined();
  });
});

// UI-007: what a workflow names by id has to exist here, or it never fires.
describe('WorkflowsService — references belong to the organisation', () => {
  const base = { name: 'Rule', triggers: ['kpi_changed' as const], action: { kind: 'create_task' as const, title: 'Follow up' } };

  test.each([
    ['a KPI that does not exist', { rule: { kind: 'kpi_value' as const, kpiId: 'nope', operator: '>' as const, value: 1 } }],
    ['a KPI in another organisation', { rule: { kind: 'kpi_value' as const, kpiId: 'theirs', operator: '>' as const, value: 1 } }],
    ['a person who is not here', { action: { kind: 'create_task' as const, title: 'X', assigneeUserId: 'ghost' } }],
    ['a channel that is not here', { action: { kind: 'send_notification' as const, channelId: 'nope', message: 'hi' } }],
    ['a webhook that is not here', { action: { kind: 'post_webhook' as const, subscriptionId: 'nope' } }],
  ])('create refuses %s, and stores nothing', async (_label, change) => {
    const { service, prisma } = makeService();
    await expect(withCtx({}, () => service.create({ ...base, ...change }))).rejects.toMatchObject({ status: 400 });
    expect(prisma.workflows).toHaveLength(0);
  });

  test('ids that are here are accepted', async () => {
    const { service } = makeService();
    await withCtx({}, () =>
      service.create({
        ...base,
        rule: { kind: 'kpi_value', kpiId: 'mrr', operator: '>', value: 1 },
        action: { kind: 'create_task', title: 'X', assigneeUserId: 'sara' },
      }),
    );
    await withCtx({}, () => service.create({ ...base, action: { kind: 'send_notification', channelId: 'email-1', message: 'hi' } }));
    await withCtx({}, () => service.create({ ...base, action: { kind: 'post_webhook', subscriptionId: 'hook-1' } }));
  });

  test('an update is checked the same way', async () => {
    const { service } = makeService();
    const wf = await withCtx({}, () => service.create(base));
    await expect(
      withCtx({}, () => service.update(wf.id, { rule: { kind: 'kpi_value', kpiId: 'theirs', operator: '>', value: 1 } })),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('WorkflowsService.trigger — "Run now"', () => {
  const celebrate = {
    name: 'celebrate',
    triggers: ['kpi_changed' as const],
    rule: { kind: 'kpi_value' as const, kpiId: 'mrr', operator: '>' as const, value: 100000 },
    action: { kind: 'create_task' as const, title: 'Celebrate!' },
  };

  test('does the action whatever the condition says, for the rule\'s KPI at its latest value', async () => {
    const { service, prisma, dispatcher } = makeService();
    prisma.latest = { value: 42 }; // far below the rule's 100000: a manual run does not care
    const wf = await withCtx({}, () => service.create(celebrate));
    await withCtx({}, () => service.trigger(wf.id));
    expect(dispatcher.run).toHaveBeenCalledWith(celebrate.action, { kind: 'kpi_changed', kpiId: 'mrr', value: 42 });
    expect(prisma.workflows[0]!.lastRunAt).not.toBeNull();
  });

  test('a failure is reported to whoever pressed the button, and the run is not recorded', async () => {
    const { service, prisma, dispatcher } = makeService();
    dispatcher.run = vi.fn(async (): Promise<void> => {
      throw new Error('The notification channel no longer exists or is switched off');
    });
    const wf = await withCtx({}, () => service.create(celebrate));
    await expect(withCtx({}, () => service.trigger(wf.id))).rejects.toMatchObject({
      status: 422,
      response: { code: 'WORKFLOW_ACTION_FAILED', message: expect.stringContaining('no longer exists') },
    });
    expect(prisma.workflows[0]!.lastRunAt).toBeNull();
  });

  test('a workflow in another organisation cannot be run', async () => {
    const { service, dispatcher } = makeService();
    const wf = await withCtx({}, () => service.create(celebrate));
    await expect(withCtx({ organizationId: 'other' }, () => service.trigger(wf.id))).rejects.toMatchObject({ status: 404 });
    expect(dispatcher.run).not.toHaveBeenCalled();
  });
});
