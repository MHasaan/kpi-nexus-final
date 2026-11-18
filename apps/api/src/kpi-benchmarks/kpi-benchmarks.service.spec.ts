import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { KpiBenchmarksService } from './kpi-benchmarks.service.js';

const ORG = 'org_alpha';
const KPI_ID = 'kpi_1';

/** KPI rows keyed by id; `categoryId` drives the Layer-3 allowlist check. */
class FakePrisma {
  constructor(private readonly categoryId: string | null) {}
  kPI = {
    findFirst: vi.fn(async () => ({ id: KPI_ID, categoryId: this.categoryId })),
  };
  kPIBenchmark = {
    findMany: vi.fn(async () => [{ id: 'bm1', kpiId: KPI_ID, organizationId: ORG }]),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

/** `null` allowlist ⇒ all (parity/admin); an array restricts to those categoryIds. */
class FakeAccessContext {
  constructor(
    private readonly allowlist: readonly string[] | null,
    private readonly kpiVisible = true,
  ) {}
  kpiCategoryAllowlist = vi.fn(async () => this.allowlist);
  isKpiVisible = vi.fn(async () => this.kpiVisible);
  /** The rows of a KPI the caller may read; `{}` = all of them. */
  pointScope: Record<string, unknown> = {};
  kpiPointScopeWhere = vi.fn(async (_scope: string) => this.pointScope);
}

function makeService(allowlist: readonly string[] | null, categoryId: string | null, kpiVisible = true): KpiBenchmarksService {
  const prisma = new FakePrisma(categoryId);
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext(allowlist, kpiVisible);
  return new KpiBenchmarksService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' };
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

describe('KpiBenchmarksService category allowlist (Phase 3 Layer-3)', () => {
  it('hides a KPI outside the category allowlist with a 404 (no existence leak)', async () => {
    // KPI is in 'cat_secret' but the principal may only see 'cat_ok'.
    const service = makeService(['cat_ok'], 'cat_secret');
    await expect(withCtx(() => service.list(KPI_ID))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a null-category KPI when an allowlist is set', async () => {
    const service = makeService(['cat_ok'], null);
    await expect(withCtx(() => service.list(KPI_ID))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('parity: a null allowlist (admin/unrestricted) leaves visibility unchanged', async () => {
    const service = makeService(null, 'cat_secret');
    const rows = await withCtx(() => service.list(KPI_ID));
    expect(rows).toHaveLength(1);
  });
});

describe('KpiBenchmarksService — KPI scope', () => {
  it('a KPI outside the caller KPI scope is a 404 even when its category is allowed', async () => {
    const service = makeService(null, 'cat_ok', false);
    await expect(withCtx(() => service.list(KPI_ID))).rejects.toBeInstanceOf(NotFoundException);
  });
});

// BE-051: a historical benchmark is the average of every value recorded on the KPI and is
// stored for everyone to see. Someone who may read only some of those values could compute
// it and read off an average of colleagues' values.
describe('KpiBenchmarksService.compute — who may compute a historical average (BE-051)', () => {
  function setup(pointScope: Record<string, unknown>) {
    const prisma = {
      kPI: { findFirst: vi.fn(async () => ({ id: KPI_ID, categoryId: null, scope: 'PER_USER' })) },
      kPIDataPoint: { findMany: vi.fn(async (_args: unknown) => [{ value: 10 }, { value: 30 }]) },
      kPIBenchmark: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'bm1', ...data })) },
    };
    const access = new FakeAccessContext(null);
    access.pointScope = pointScope;
    const service = new KpiBenchmarksService(prisma as unknown as PrismaService, new FakeAudit() as unknown as AuditService, access as unknown as AccessContextService);
    return { prisma, access, service };
  }

  it('someone who can read every value of the KPI gets the average', async () => {
    const { service, prisma, access } = setup({});
    await expect(withCtx(() => service.compute(KPI_ID, { kind: 'INTERNAL_HISTORICAL', days: 30 }))).resolves.toMatchObject({ value: 20 });
    expect(access.kpiPointScopeWhere).toHaveBeenCalledWith('PER_USER');
    expect(prisma.kPIDataPoint.findMany).toHaveBeenCalledOnce();
  });

  it('someone who can read only some of them is refused, and nothing is read or stored', async () => {
    const { service, prisma } = setup({ userId: { in: ['u1'] } });
    await expect(withCtx(() => service.compute(KPI_ID, { kind: 'INTERNAL_HISTORICAL', days: 30 }))).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(prisma.kPIDataPoint.findMany).not.toHaveBeenCalled();
    expect(prisma.kPIBenchmark.create).not.toHaveBeenCalled();
  });
});
