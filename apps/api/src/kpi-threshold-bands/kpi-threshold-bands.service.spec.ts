import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { KpiThresholdBandsService } from './kpi-threshold-bands.service.js';

const ORG = 'org_alpha';
const KPI_ID = 'kpi_1';

/** KPI rows keyed by id; `categoryId` drives the Layer-3 allowlist check. */
class FakePrisma {
  constructor(private readonly categoryId: string | null) {}
  kPI = {
    findFirst: vi.fn(async () => ({ id: KPI_ID, categoryId: this.categoryId })),
  };
  kPIThresholdBand = {
    findMany: vi.fn(async () => [{ id: 'b1', kpiId: KPI_ID, organizationId: ORG }]),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

/** `null` allowlist ⇒ all (parity/admin); an array restricts to those categoryIds. */
class FakeAccessContext {
  constructor(private readonly allowlist: readonly string[] | null) {}
  kpiCategoryAllowlist = vi.fn(async () => this.allowlist);
}

function makeService(allowlist: readonly string[] | null, categoryId: string | null): KpiThresholdBandsService {
  const prisma = new FakePrisma(categoryId);
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext(allowlist);
  return new KpiThresholdBandsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' };
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

describe('KpiThresholdBandsService category allowlist (Phase 3 Layer-3)', () => {
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

describe('KpiThresholdBandsService.update bounds (BE-012)', () => {
  function serviceWithBand(band: { lower: number | null; upper: number | null }) {
    const prisma = {
      kPIThresholdBand: {
        findFirst: vi.fn(async () => ({ id: 'b1', ...band })),
        update: vi.fn(async () => ({ id: 'b1' })),
      },
    };
    const service = new KpiThresholdBandsService(
      prisma as unknown as PrismaService,
      new FakeAudit() as unknown as AuditService,
      new FakeAccessContext(null) as unknown as AccessContextService,
    );
    return { service, prisma };
  }

  it('rejects a partial update that would leave lower above the stored upper', async () => {
    const { service, prisma } = serviceWithBand({ lower: 0, upper: 100 });
    await expect(withCtx(() => service.update('b1', { lower: 500 }))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.kPIThresholdBand.update).not.toHaveBeenCalled();
  });

  it('allows a partial update that keeps the bounds ordered', async () => {
    const { service, prisma } = serviceWithBand({ lower: 0, upper: 100 });
    await withCtx(() => service.update('b1', { lower: 50 }));
    expect(prisma.kPIThresholdBand.update).toHaveBeenCalledTimes(1);
  });
});

describe('KpiThresholdBandsService.resolveStatus (AN-002)', () => {
  it('reads the newest periods, not the newest entries', async () => {
    const prisma = {
      kPI: { findFirst: vi.fn(async () => ({ id: KPI_ID, categoryId: null })) },
      kPIThresholdBand: {
        findMany: vi.fn(async () => [
          { name: 'Green', lower: 0, upper: null, color: '#0f0', order: 0, consecutivePointsRequired: 2 },
        ]),
      },
      kPIDataPoint: { findMany: vi.fn(async (_args: unknown) => [{ value: 5 }, { value: 6 }]) },
    };
    const service = new KpiThresholdBandsService(
      prisma as unknown as PrismaService,
      new FakeAudit() as unknown as AuditService,
      new FakeAccessContext(null) as unknown as AccessContextService,
    );
    await withCtx(() => service.resolveStatus(KPI_ID));
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0]).toMatchObject({
      where: { kpiId: KPI_ID, organizationId: ORG },
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      take: 2,
    });
  });
});
