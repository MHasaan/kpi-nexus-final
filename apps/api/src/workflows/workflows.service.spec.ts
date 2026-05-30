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
  const dispatcher = { dispatch: vi.fn(async () => {}) };
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
