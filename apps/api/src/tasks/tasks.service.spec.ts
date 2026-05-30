/**
 * TasksService unit tests. In-memory Prisma fake + no-op audit + fake resolver.
 * Covers: create (createdById from ctx), org-scoped + entity-bound visibility
 * (admin sees all; non-admin sees own created + assigned), filters, cross-tenant
 * 404, update/delete permission (creator/assignee/USERS_MANAGE), my-tasks, by-kpi.
 */
import { describe, expect, test, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { TasksService } from './tasks.service.js';

interface FakeTask {
  id: string;
  organizationId: string;
  kpiId: string | null;
  alertId: string | null;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  dueAt: Date | null;
  status: string;
  priority: string;
  externalRef: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

function matchWhere(t: FakeTask, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (
      k === 'organizationId' ||
      k === 'status' ||
      k === 'priority' ||
      k === 'assigneeUserId' ||
      k === 'kpiId' ||
      k === 'createdById'
    ) {
      if ((t as unknown as Record<string, unknown>)[k] !== v) return false;
    } else if (k === 'dueAt') {
      const cond = v as { gte?: Date; lte?: Date };
      if (cond.gte && (!t.dueAt || t.dueAt < cond.gte)) return false;
      if (cond.lte && (!t.dueAt || t.dueAt > cond.lte)) return false;
    } else if (k === 'OR') {
      const branches = v as Array<Record<string, unknown>>;
      if (!branches.some((b) => matchWhere(t, b))) return false;
    } else if (k === 'id') {
      if (t.id !== v) return false;
    }
  }
  return true;
}

class FakePrisma {
  private n = 1;
  tasks: FakeTask[] = [];

  task = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.tasks.filter((t) => matchWhere(t, where)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.tasks.find((t) => matchWhere(t, where)) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const t: FakeTask = {
        id: `task_${this.n++}`,
        organizationId: data.organizationId as string,
        kpiId: (data.kpiId as string) ?? null,
        alertId: (data.alertId as string) ?? null,
        title: data.title as string,
        description: (data.description as string) ?? null,
        assigneeUserId: (data.assigneeUserId as string) ?? null,
        dueAt: (data.dueAt as Date) ?? null,
        status: (data.status as string) ?? 'TODO',
        priority: (data.priority as string) ?? 'MEDIUM',
        externalRef: (data.externalRef as string) ?? null,
        createdById: data.createdById as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.tasks.push(t);
      return t;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const t = this.tasks.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (t as unknown as Record<string, unknown>)[k] = data[k];
      t.updatedAt = new Date();
      return t;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.tasks = this.tasks.filter((t) => t.id !== where.id);
      return {};
    }),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

class FakeResolver {
  constructor(
    private isAdmin = false,
    private perms: PermissionKey[] = [],
  ) {}
  resolveForCurrentPrincipal = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    permissions: new Set(this.perms),
    resolvedAt: 0,
    fromDelegations: [],
  }));
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'u1', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService(resolver = new FakeResolver()) {
  const prisma = new FakePrisma();
  const service = new TasksService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
    resolver as unknown as PermissionResolverService,
  );
  return { service, prisma };
}

describe('TasksService', () => {
  test('create sets createdById + org from context', async () => {
    const { service } = makeService();
    const t = await withCtx({ userId: 'alice' }, () => service.create({ title: 'Fix churn' }));
    expect(t.createdById).toBe('alice');
    expect(t.organizationId).toBe(ORG);
    expect(t.status).toBe('TODO');
  });

  test('list is org-scoped', async () => {
    const admin = new FakeResolver(true);
    const { service } = makeService(admin);
    await withCtx({ userId: 'a' }, () => service.create({ title: 'A' }));
    await withCtx({ userId: 'a', organizationId: 'other' }, () => service.create({ title: 'B' }));
    const rows = await withCtx({ userId: 'a' }, () => service.list({}));
    expect(rows.map((r) => r.title)).toEqual(['A']);
  });

  test('non-admin sees only own created + assigned tasks', async () => {
    const { service, prisma } = makeService(new FakeResolver(false));
    // bob creates one assigned to carol; carol creates one for herself
    await withCtx({ userId: 'bob' }, () => service.create({ title: 'For carol', assigneeUserId: 'carol' }));
    await withCtx({ userId: 'carol' }, () => service.create({ title: 'Carol own' }));
    await withCtx({ userId: 'dave' }, () => service.create({ title: 'Dave own' }));
    expect(prisma.tasks).toHaveLength(3);
    const carolView = await withCtx({ userId: 'carol' }, () => service.list({}));
    expect(carolView.map((r) => r.title).sort()).toEqual(['Carol own', 'For carol']);
  });

  test('admin sees all tasks', async () => {
    const { service } = makeService(new FakeResolver(true));
    await withCtx({ userId: 'bob' }, () => service.create({ title: 'X' }));
    await withCtx({ userId: 'carol' }, () => service.create({ title: 'Y' }));
    const rows = await withCtx({ userId: 'admin' }, () => service.list({}));
    expect(rows).toHaveLength(2);
  });

  test('filters by status and priority', async () => {
    const { service } = makeService(new FakeResolver(true));
    await withCtx({ userId: 'a' }, () => service.create({ title: 'todo', priority: 'LOW' }));
    await withCtx({ userId: 'a' }, () => service.create({ title: 'urgent', priority: 'URGENT', status: 'IN_PROGRESS' }));
    const urgent = await withCtx({ userId: 'a' }, () => service.list({ priority: 'URGENT' }));
    expect(urgent.map((r) => r.title)).toEqual(['urgent']);
    const inProg = await withCtx({ userId: 'a' }, () => service.list({ status: 'IN_PROGRESS' }));
    expect(inProg.map((r) => r.title)).toEqual(['urgent']);
  });

  test('getById 404 for another tenant', async () => {
    const { service } = makeService(new FakeResolver(true));
    const t = await withCtx({ organizationId: 'org_a' }, () => service.create({ title: 'X' }));
    await expect(withCtx({ organizationId: 'org_b' }, () => service.getById(t.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('non-admin getById 404 when not creator/assignee', async () => {
    const { service } = makeService(new FakeResolver(false));
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 'secret' }));
    await expect(withCtx({ userId: 'eve' }, () => service.getById(t.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('update allowed for creator', async () => {
    const { service } = makeService(new FakeResolver(false));
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 'mine' }));
    const u = await withCtx({ userId: 'bob' }, () => service.update(t.id, { status: 'DONE' }));
    expect(u.status).toBe('DONE');
  });

  test('update allowed for assignee', async () => {
    const { service } = makeService(new FakeResolver(false));
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 'for carol', assigneeUserId: 'carol' }));
    const u = await withCtx({ userId: 'carol' }, () => service.update(t.id, { status: 'IN_PROGRESS' }));
    expect(u.status).toBe('IN_PROGRESS');
  });

  test('update forbidden for unrelated non-manager (task exists in org → 403)', async () => {
    const { service } = makeService(new FakeResolver(false));
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 'mine', assigneeUserId: 'bob' }));
    await expect(withCtx({ userId: 'eve' }, () => service.update(t.id, { status: 'DONE' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('update allowed for USERS_MANAGE holder even if not creator/assignee', async () => {
    const manager = new FakeResolver(false, [PermissionKey.USERS_MANAGE]);
    const { service } = makeService(manager);
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 'mine' }));
    const u = await withCtx({ userId: 'mgr' }, () => service.update(t.id, { priority: 'HIGH' }));
    expect(u.priority).toBe('HIGH');
  });

  test('delete forbidden for non-creator without USERS_MANAGE (but visible)', async () => {
    // assignee can see but only creator/USERS_MANAGE/admin can delete
    const { service } = makeService(new FakeResolver(false));
    const t = await withCtx({ userId: 'bob' }, () => service.create({ title: 't', assigneeUserId: 'carol' }));
    await expect(withCtx({ userId: 'carol' }, () => service.remove(t.id))).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('myTasks returns only tasks assigned to current user', async () => {
    const { service } = makeService(new FakeResolver(true));
    await withCtx({ userId: 'bob' }, () => service.create({ title: 'b1', assigneeUserId: 'carol' }));
    await withCtx({ userId: 'bob' }, () => service.create({ title: 'b2' }));
    const mine = await withCtx({ userId: 'carol' }, () => service.myTasks());
    expect(mine.map((r) => r.title)).toEqual(['b1']);
  });

  test('byKpi filters to a kpi (org-scoped)', async () => {
    const { service } = makeService(new FakeResolver(true));
    await withCtx({ userId: 'a' }, () => service.create({ title: 'linked', kpiId: 'kpi_1' }));
    await withCtx({ userId: 'a' }, () => service.create({ title: 'other', kpiId: 'kpi_2' }));
    const rows = await withCtx({ userId: 'a' }, () => service.byKpi('kpi_1'));
    expect(rows.map((r) => r.title)).toEqual(['linked']);
  });
});
