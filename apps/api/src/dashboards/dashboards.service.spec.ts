/**
 * P3.2 — DashboardsService unit tests.
 *
 * Pure unit. Prisma is replaced with an in-memory fake; AuditService is a
 * no-op spy. Coverage targets the bits that have the most subtle
 * correctness implications:
 *
 *   - visibility filter (owner OR isShared) for non-admins
 *   - admin sees all
 *   - 412 on If-Match version mismatch
 *   - 404 for cross-tenant lookups
 *   - setDefault clears any previous default for the same user
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException, PreconditionFailedException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { DashboardsService, buildDashboardEtag, parseIfMatch } from './dashboards.service.js';

interface FakeDashboard {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  ownerRoleId: string | null;
  isShared: boolean;
  isDefault: boolean;
  layout: unknown;
  version: number;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
}

class FakePrisma {
  private nextId = 1;
  store: FakeDashboard[] = [];

  dashboard = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return this.store
        .filter((d) => this.matches(d, where))
        .map((d) => this.materialize(d));
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const d = this.store.find((d) => this.matches(d, where));
      return d ? this.materialize(d) : null;
    }),
    create: vi.fn(async ({ data }: { data: Partial<FakeDashboard> }) => {
      const created: FakeDashboard = {
        id: `dash_${this.nextId++}`,
        organizationId: data.organizationId!,
        name: data.name!,
        description: data.description ?? null,
        ownerUserId: data.ownerUserId ?? null,
        ownerRoleId: data.ownerRoleId ?? null,
        isShared: data.isShared ?? false,
        isDefault: data.isDefault ?? false,
        layout: data.layout ?? null,
        version: 1,
        deletedAt: null,
        deletedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: data.createdById ?? null,
      };
      this.store.push(created);
      return this.materialize(created);
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = this.store.findIndex((d) => d.id === where.id);
        if (idx === -1) throw new Error('Not found');
        const cur = this.store[idx]!;
        if (data.version && typeof data.version === 'object' && 'increment' in (data.version as Record<string, unknown>)) {
          cur.version += (data.version as { increment: number }).increment;
        }
        for (const k of Object.keys(data)) {
          if (k === 'version') continue;
          (cur as unknown as Record<string, unknown>)[k] = data[k];
        }
        cur.updatedAt = new Date();
        return this.materialize(cur);
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const d of this.store) {
          if (this.matches(d, where)) {
            for (const k of Object.keys(data)) {
              (d as unknown as Record<string, unknown>)[k] = data[k];
            }
            count++;
          }
        }
        return { count };
      },
    ),
  };

  $transaction = vi.fn(async (fn: (tx: FakePrisma) => Promise<unknown>) => {
    return fn(this);
  });

  private matches(d: FakeDashboard, where: Record<string, unknown>): boolean {
    if (where.id && d.id !== where.id) return false;
    if (where.organizationId && d.organizationId !== where.organizationId) return false;
    if ('deletedAt' in where && where.deletedAt === null && d.deletedAt !== null) return false;
    if (where.ownerUserId && d.ownerUserId !== where.ownerUserId) return false;
    if (typeof where.isShared === 'boolean' && d.isShared !== where.isShared) return false;
    if (typeof where.isDefault === 'boolean' && d.isDefault !== where.isDefault) return false;
    if (Array.isArray(where.OR)) {
      const matchesAny = (where.OR as Array<Record<string, unknown>>).some((branch) =>
        this.matches(d, branch),
      );
      if (!matchesAny) return false;
    }
    return true;
  }

  private materialize(d: FakeDashboard): FakeDashboard & { widgets: never[] } {
    return { ...d, widgets: [] };
  }
}

class FakeAudit {
  records: Array<Record<string, unknown>> = [];
  record = vi.fn(async (input: Record<string, unknown>) => {
    this.records.push(input);
  });
}

class FakeResolver {
  isAdmin = false;
  resolveForUser = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    permissions: new Set<string>(),
  }));
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  const fullCtx: RequestContext = {
    userId: ctx.userId ?? 'u1',
    organizationId: ctx.organizationId ?? ORG,
    roleId: ctx.roleId ?? null,
    principalType: ctx.principalType ?? 'user',
  };
  return RequestContextStore.run(fullCtx, fn);
}

function makeService(): {
  service: DashboardsService;
  prisma: FakePrisma;
  audit: FakeAudit;
  resolver: FakeResolver;
} {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const resolver = new FakeResolver();
  const service = new DashboardsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    resolver as unknown as PermissionResolverService,
  );
  return { service, prisma, audit, resolver };
}

describe('parseIfMatch', () => {
  test('parses weak ETag', () => {
    expect(parseIfMatch('W/"3"')).toBe(3);
  });
  test('parses strong ETag', () => {
    expect(parseIfMatch('"7"')).toBe(7);
  });
  test('returns null for missing header', () => {
    expect(parseIfMatch(undefined)).toBeNull();
  });
  test('returns null for unparseable input', () => {
    expect(parseIfMatch('garbage')).toBeNull();
  });
});

describe('buildDashboardEtag', () => {
  test('builds weak ETag from version', () => {
    expect(buildDashboardEtag(5)).toBe('W/"5"');
  });
});

describe('DashboardsService.list', () => {
  test('admin sees all non-deleted dashboards in the org', async () => {
    const { service, prisma, resolver } = makeService();
    resolver.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else' }),
      makeRow({ id: 'd2', ownerUserId: 'u1' }),
      makeRow({ id: 'd3', ownerUserId: 'other', isShared: false }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  test('non-admin sees only owned or shared dashboards', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', isShared: false }),
      makeRow({ id: 'd2', ownerUserId: 'someone_else', isShared: true }),
      makeRow({ id: 'd3', ownerUserId: 'someone_else', isShared: false }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  test('does not leak deleted rows', async () => {
    const { service, prisma, resolver } = makeService();
    resolver.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result).toEqual([]);
  });
});

describe('DashboardsService.getById', () => {
  test('owner can read', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1' }));
    const result = await withCtx({ userId: 'u1' }, () => service.getById('d1'));
    expect(result.id).toBe('d1');
  });

  test('non-owner non-shared returns 404 (no existence leak)', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.getById('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('isShared dashboard is visible to non-owner', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: true }));
    const result = await withCtx({ userId: 'u1' }, () => service.getById('d1'));
    expect(result.id).toBe('d1');
  });

  test('cross-tenant lookup returns 404', async () => {
    const { service, prisma, resolver } = makeService();
    resolver.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', organizationId: 'other_org', ownerUserId: 'u1' }));
    await expect(
      withCtx({ userId: 'u1', organizationId: ORG }, () => service.getById('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DashboardsService.update — optimistic concurrency', () => {
  test('matching If-Match version succeeds, bumps version', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', name: 'Old' }));
    const result = await withCtx({ userId: 'u1' }, () =>
      service.update('d1', { name: 'New' }, 1),
    );
    expect(result.name).toBe('New');
    expect(result.version).toBe(2);
  });

  test('mismatched If-Match version throws 412 with current ETag', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 5 }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.update('d1', { name: 'X' }, 3)),
    ).rejects.toMatchObject({
      response: {
        code: 'PRECONDITION_FAILED',
        details: { currentVersion: 5, currentEtag: 'W/"5"' },
      },
    });
  });

  test('null If-Match (header absent) skips the check', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 7 }));
    const result = await withCtx({ userId: 'u1' }, () =>
      service.update('d1', { name: 'Skip' }, null),
    );
    expect(result.version).toBe(8);
  });

  test('returns 412 — instanceof PreconditionFailedException', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 2 }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.update('d1', { name: 'X' }, 1)),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });
});

describe('DashboardsService.setDefault', () => {
  test('clears previous default for the same user and sets the new one', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', isDefault: true }),
      makeRow({ id: 'd2', ownerUserId: 'u1', isDefault: false }),
    );
    await withCtx({ userId: 'u1' }, () => service.setDefault('d2'));
    expect(prisma.store.find((d) => d.id === 'd1')!.isDefault).toBe(false);
    expect(prisma.store.find((d) => d.id === 'd2')!.isDefault).toBe(true);
  });

  test("does not touch another user's default flag", async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u2', isDefault: true }),
      makeRow({ id: 'd2', ownerUserId: 'u1', isDefault: false, isShared: true }),
    );
    await withCtx({ userId: 'u1' }, () => service.setDefault('d2'));
    expect(prisma.store.find((d) => d.id === 'd1')!.isDefault).toBe(true);
  });
});

describe('DashboardsService.create', () => {
  test('records audit and stores ownerUserId from context', async () => {
    const { service, prisma, audit } = makeService();
    const created = await withCtx({ userId: 'u1' }, () =>
      service.create({ name: 'My dash', isShared: false, tags: [] } as unknown as Parameters<
        DashboardsService['create']
      >[0]),
    );
    expect(prisma.store).toHaveLength(1);
    expect(created.ownerUserId).toBe('u1');
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({ action: 'CREATE', entityType: 'Dashboard' });
  });
});

describe('DashboardsService.remove', () => {
  test('soft deletes by setting deletedAt', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1' }));
    await withCtx({ userId: 'u1' }, () => service.remove('d1'));
    expect(prisma.store[0]!.deletedAt).not.toBeNull();
    expect(prisma.store[0]!.deletedById).toBe('u1');
  });
});

function makeRow(over: Partial<FakeDashboard> = {}): FakeDashboard {
  return {
    id: 'd_x',
    organizationId: ORG,
    name: 'Dash',
    description: null,
    ownerUserId: 'u1',
    ownerRoleId: null,
    isShared: false,
    isDefault: false,
    layout: null,
    version: 1,
    deletedAt: null,
    deletedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'u1',
    ...over,
  };
}
