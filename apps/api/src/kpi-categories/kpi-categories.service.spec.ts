/**
 * KpiCategoriesService unit tests. In-memory Prisma fake + no-op audit.
 * Covers: create (+ unique-name conflict), org-scoped list/get, update,
 * delete (blocked when KPIs reference the category), cross-tenant 404.
 */
import { describe, expect, test, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { KpiCategoriesService } from './kpi-categories.service.js';

interface FakeCat {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: Date;
  kpiCount: number;
}

class UniqueError extends Error {
  code = 'P2002';
}

class FakePrisma {
  private n = 1;
  cats: FakeCat[] = [];

  kPICategory = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.cats.filter((c) => c.organizationId === where.organizationId).map((c) => this.mat(c)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const c = this.cats.find((c) => c.id === where.id && c.organizationId === where.organizationId);
      return c ? this.mat(c) : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (this.cats.some((c) => c.organizationId === data.organizationId && c.name === data.name)) {
        throw new UniqueError('dup');
      }
      const c: FakeCat = {
        id: `cat_${this.n++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        color: (data.color as string) ?? null,
        icon: (data.icon as string) ?? null,
        sortOrder: (data.sortOrder as number) ?? 0,
        createdAt: new Date(),
        kpiCount: 0,
      };
      this.cats.push(c);
      return this.mat(c);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const c = this.cats.find((c) => c.id === where.id)!;
      if (data.name && this.cats.some((o) => o.id !== c.id && o.organizationId === c.organizationId && o.name === data.name)) {
        throw new UniqueError('dup');
      }
      for (const k of Object.keys(data)) if (data[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = data[k];
      return this.mat(c);
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.cats = this.cats.filter((c) => c.id !== where.id);
      return {};
    }),
  };

  private mat(c: FakeCat) {
    return { ...c, _count: { kpis: c.kpiCount } };
  }
}

class FakeAudit {
  record = vi.fn(async () => {});
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'u1', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const service = new KpiCategoriesService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
  );
  return { service, prisma };
}

describe('KpiCategoriesService', () => {
  test('create then list (org-scoped)', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ name: 'Financial' }));
    await withCtx({ organizationId: 'other' }, () => service.create({ name: 'Other Org Cat' }));
    const rows = await withCtx({}, () => service.list());
    expect(rows.map((r) => r.name)).toEqual(['Financial']);
  });

  test('duplicate name in same org → 409', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ name: 'Dup' }));
    await expect(withCtx({}, () => service.create({ name: 'Dup' }))).rejects.toBeInstanceOf(ConflictException);
  });

  test('getById 404 for another tenant', async () => {
    const { service } = makeService();
    const c = await withCtx({ organizationId: 'org_a' }, () => service.create({ name: 'X' }));
    await expect(withCtx({ organizationId: 'org_b' }, () => service.getById(c.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('update renames', async () => {
    const { service } = makeService();
    const c = await withCtx({}, () => service.create({ name: 'Old' }));
    const u = await withCtx({}, () => service.update(c.id, { name: 'New', color: '#fff' }));
    expect(u.name).toBe('New');
    expect(u.color).toBe('#fff');
  });

  test('delete blocked when KPIs reference the category', async () => {
    const { service, prisma } = makeService();
    const c = await withCtx({}, () => service.create({ name: 'InUse' }));
    prisma.cats.find((x) => x.id === c.id)!.kpiCount = 3;
    await expect(withCtx({}, () => service.remove(c.id))).rejects.toBeInstanceOf(ConflictException);
  });

  test('delete succeeds when unused', async () => {
    const { service, prisma } = makeService();
    const c = await withCtx({}, () => service.create({ name: 'Free' }));
    await withCtx({}, () => service.remove(c.id));
    expect(prisma.cats).toHaveLength(0);
  });
});
