/**
 * ActivityService unit tests. Cursor pagination over AuditLog with side-loaded
 * user names. Covers: org scoping, admin-sees-all vs own-only, filters, and the
 * peek-ahead nextCursor.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ActivityService } from './activity.service.js';

interface FakeLog {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  createdAt: Date;
}

class FakePrisma {
  logs: FakeLog[] = [];
  users = [{ id: 'alice', fullName: 'Alice' }, { id: 'bob', fullName: 'Bob' }];

  auditLog = {
    findMany: vi.fn(async ({ where, take, cursor, skip }: { where: Record<string, unknown>; take: number; cursor?: { id: string }; skip?: number }) => {
      let rows = this.logs
        .filter((l) => l.organizationId === where.organizationId && (where.userId === undefined ? true : l.userId === where.userId) && (where.entityType === undefined ? true : l.entityType === where.entityType))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (cursor) {
        const idx = rows.findIndex((r) => r.id === cursor.id);
        rows = rows.slice(idx + (skip ?? 0));
      }
      return rows.slice(0, take);
    }),
  };

  user = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => this.users.filter((u) => where.id.in.includes(u.id))),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'alice', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService(isAdmin: boolean) {
  const prisma = new FakePrisma();
  const resolver = { resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin, permissions: new Set(), resolvedAt: 0, fromDelegations: [] })) };
  const service = new ActivityService(prisma as unknown as PrismaService, resolver as unknown as PermissionResolverService);
  return { service, prisma };
}

function seed(prisma: FakePrisma): void {
  for (let i = 0; i < 5; i++) {
    prisma.logs.push({ id: `log_${i}`, organizationId: ORG, userId: i % 2 === 0 ? 'alice' : 'bob', action: 'UPDATE', entityType: 'KPI', createdAt: new Date(1000 + i) });
  }
}

describe('ActivityService.list', () => {
  test('admin sees all org activity with side-loaded user names', async () => {
    const { service, prisma } = makeService(true);
    seed(prisma);
    const res = await withCtx({ userId: 'admin' }, () => service.list({ limit: 10 }));
    expect(res.items).toHaveLength(5);
    expect(res.items[0]!.userName).toBeDefined();
  });

  test('non-admin sees only their own activity', async () => {
    const { service, prisma } = makeService(false);
    seed(prisma);
    const res = await withCtx({ userId: 'bob' }, () => service.list({ limit: 10 }));
    expect(res.items.every((i) => i.userId === 'bob')).toBe(true);
  });

  test('cursor pagination yields nextCursor then drains', async () => {
    const { service, prisma } = makeService(true);
    seed(prisma);
    const page1 = await withCtx({ userId: 'admin' }, () => service.list({ limit: 2 }));
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await withCtx({ userId: 'admin' }, () => service.list({ limit: 2, cursor: page1.nextCursor! }));
    expect(page2.items).toHaveLength(2);
    const page3 = await withCtx({ userId: 'admin' }, () => service.list({ limit: 2, cursor: page2.nextCursor! }));
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });

  test('entityType filter narrows results', async () => {
    const { service, prisma } = makeService(true);
    seed(prisma);
    prisma.logs.push({ id: 'log_x', organizationId: ORG, userId: 'alice', action: 'CREATE', entityType: 'Dashboard', createdAt: new Date(2000) });
    const res = await withCtx({ userId: 'admin' }, () => service.list({ entityType: 'Dashboard', limit: 10 }));
    expect(res.items.every((i) => i.entityType === 'Dashboard')).toBe(true);
  });
});
