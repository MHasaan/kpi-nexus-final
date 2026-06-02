/**
 * UsersService unit tests — suspend + reactivate. In-memory Prisma fake +
 * no-op audit. Covers: status transitions, org-scoping (NotFound across
 * tenants), the self-suspend guard, and the terminal-state rejection.
 */
import { describe, expect, test, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UsersService } from './users.service.js';

interface FakeUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
  createdAt: Date;
}

class FakePrisma {
  users: FakeUser[] = [];

  user = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.users.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const u = this.users.find((u) => u.id === where.id)!;
      Object.assign(u, data);
      return u;
    }),
  };

  refreshToken = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };

  overrides: Array<Record<string, unknown>> = [];
  categories: Array<{ id: string; organizationId: string }> = [];

  userAccessOverride = {
    findFirst: vi.fn(
      async ({ where }: { where: { organizationId: string; userId: string } }) =>
        this.overrides.find(
          (o) => o.userId === where.userId && o.organizationId === where.organizationId,
        ) ?? null,
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = this.overrides.find((o) => o.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { updatedAt: new Date(), ...create };
        this.overrides.push(row);
        return row;
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const before = this.overrides.length;
      this.overrides = this.overrides.filter((o) => o.userId !== where.userId);
      return { count: before - this.overrides.length };
    }),
  };

  kPICategory = {
    findMany: vi.fn(
      async ({ where }: { where: { id: { in: string[] }; organizationId: string } }) =>
        this.categories
          .filter((c) => c.organizationId === where.organizationId && where.id.in.includes(c.id))
          .map((c) => ({ id: c.id })),
    ),
  };

  // Transactions run the callback against this same fake (mirrors the service's
  // tx usage: tx.user.update + tx.refreshToken.deleteMany).
  $transaction = vi.fn(async (fn: (tx: FakePrisma) => Promise<unknown>) => fn(this));
}

class FakeAudit {
  record = vi.fn(async () => {});
}

const ORG = 'org_alpha';
const CALLER = 'u_admin';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    {
      userId: ctx.userId ?? CALLER,
      organizationId: ctx.organizationId ?? ORG,
      roleId: ctx.roleId ?? null,
      principalType: ctx.principalType ?? 'user',
    },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const resolver = { invalidate: vi.fn() };
  const accessContext = { invalidate: vi.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    resolver as unknown as import('../rbac/services/permission-resolver.service.js').PermissionResolverService,
    accessContext as unknown as import('../rbac/services/access-context.service.js').AccessContextService,
  );
  return { service, prisma, audit, resolver, accessContext };
}

function seedUser(prisma: FakePrisma, over: Partial<FakeUser> = {}): FakeUser {
  const u: FakeUser = {
    id: over.id ?? 'u_target',
    organizationId: over.organizationId ?? ORG,
    email: over.email ?? 'target@example.com',
    fullName: over.fullName ?? 'Target User',
    status: over.status ?? 'ACTIVE',
    roleId: over.roleId ?? null,
    managerId: over.managerId ?? null,
    positionId: over.positionId ?? null,
    createdAt: over.createdAt ?? new Date(),
  };
  prisma.users.push(u);
  return u;
}

describe('UsersService.suspend', () => {
  test('transitions an ACTIVE user to SUSPENDED and audits', async () => {
    const { service, prisma, audit } = makeService();
    seedUser(prisma);
    const result = await withCtx({}, () => service.suspend('u_target'));
    expect(result.status).toBe('SUSPENDED');
    expect(prisma.users[0]!.status).toBe('SUSPENDED');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'User', entityId: 'u_target' }),
    );
  });

  test('refuses self-suspension', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma, { id: CALLER });
    await expect(withCtx({}, () => service.suspend(CALLER))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('throws NotFound for a user in another org (tenant scope)', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma, { organizationId: 'org_beta' });
    await expect(withCtx({}, () => service.suspend('u_target'))).rejects.toBeInstanceOf(NotFoundException);
  });

  test.each(['ARCHIVED', 'DELETED', 'PURGED'])(
    'refuses to suspend a %s user',
    async (status) => {
      const { service, prisma } = makeService();
      seedUser(prisma, { status });
      await expect(withCtx({}, () => service.suspend('u_target'))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );
});

describe('UsersService.reactivate', () => {
  test('transitions a SUSPENDED user back to ACTIVE and audits', async () => {
    const { service, prisma, audit } = makeService();
    seedUser(prisma, { status: 'SUSPENDED' });
    const result = await withCtx({}, () => service.reactivate('u_target'));
    expect(result.status).toBe('ACTIVE');
    expect(prisma.users[0]!.status).toBe('ACTIVE');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'User', entityId: 'u_target' }),
    );
  });

  test('throws NotFound for a user in another org (tenant scope)', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma, { status: 'SUSPENDED', organizationId: 'org_beta' });
    await expect(withCtx({}, () => service.reactivate('u_target'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('rejects reactivating a user that is not SUSPENDED', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma, { status: 'ACTIVE' });
    await expect(withCtx({}, () => service.reactivate('u_target'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('UsersService — access override (Phase 5)', () => {
  test('upsert persists the override + invalidates both caches', async () => {
    const { service, prisma, resolver, accessContext } = makeService();
    seedUser(prisma);
    const result = await withCtx({}, () =>
      service.upsertAccessOverride('u_target', {
        grantCapabilities: ['EXPORTS'],
        revokeCapabilities: ['KPI_DELETE'],
        scopeConfig: { KPIS: 'SELF' },
      }),
    );
    expect(result.grantCapabilities).toEqual(['EXPORTS']);
    expect(result.scopeConfig).toEqual({ KPIS: 'SELF' });
    expect(prisma.overrides).toHaveLength(1);
    expect(resolver.invalidate).toHaveBeenCalledWith(ORG, 'u_target');
    expect(accessContext.invalidate).toHaveBeenCalledWith(ORG, 'u_target');
  });

  test('rejects an unknown KPI category id (tenant validation)', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma);
    // no categories seeded ⇒ the id is unknown to the tenant
    await expect(
      withCtx({}, () =>
        service.upsertAccessOverride('u_target', {
          grantCapabilities: [],
          revokeCapabilities: [],
          dataTypeConfig: { kpiCategoryIds: ['cat_unknown'] },
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(prisma.overrides).toHaveLength(0);
  });

  test('get returns the override; delete clears it + invalidates', async () => {
    const { service, prisma, resolver, accessContext } = makeService();
    seedUser(prisma);
    await withCtx({}, () =>
      service.upsertAccessOverride('u_target', { grantCapabilities: ['EXPORTS'], revokeCapabilities: [] }),
    );
    const got = await withCtx({}, () => service.getAccessOverride('u_target'));
    expect(got?.grantCapabilities).toEqual(['EXPORTS']);

    await withCtx({}, () => service.deleteAccessOverride('u_target'));
    expect(prisma.overrides).toHaveLength(0);
    expect(resolver.invalidate).toHaveBeenCalledWith(ORG, 'u_target');
    expect(accessContext.invalidate).toHaveBeenCalledWith(ORG, 'u_target');
    expect(await withCtx({}, () => service.getAccessOverride('u_target'))).toBeNull();
  });

  test('a user from another tenant is not found', async () => {
    const { service, prisma } = makeService();
    seedUser(prisma, { id: 'u_other', organizationId: 'org_other' });
    await expect(
      withCtx({}, () => service.getAccessOverride('u_other')),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});
