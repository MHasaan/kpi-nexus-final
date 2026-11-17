import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { BillingService } from './billing.service.js';

const tenant = { userId: 'user-a', organizationId: 'org-a', roleId: null, principalType: 'user' as const };

describe('BillingService global plan initialization', () => {
  it('initializes the catalog under system context and restores the tenant context', async () => {
    const createMany = vi.fn(async () => {
      if (!RequestContextStore.require().bypassRls) throw new Error('Plan write rejected by RLS');
      return { count: 3 };
    });
    const prisma = { plan: { count: vi.fn().mockResolvedValue(0), createMany } };
    const service = new BillingService(prisma as unknown as PrismaService);
    await RequestContextStore.run(tenant, async () => {
      await expect(service.seedIfEmpty()).resolves.toBeUndefined();
      expect(RequestContextStore.require()).toBe(tenant);
    });
    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany.mock.calls[0]).toEqual([expect.objectContaining({ skipDuplicates: true })]);
    expect(RequestContextStore.get()).toBeUndefined();
  });

  it('keeps an existing catalog unchanged', async () => {
    const prisma = { plan: { count: vi.fn().mockResolvedValue(3), createMany: vi.fn() } };
    await RequestContextStore.run(tenant, () => new BillingService(prisma as unknown as PrismaService).seedIfEmpty());
    expect(prisma.plan.createMany).not.toHaveBeenCalled();
  });
});

describe('BillingService usage and plans', () => {
  const plan = { key: 'FREE', displayName: 'Free', monthlyPriceUsd: 0, features: [], quotas: { kpis: 10, dashboards: 3, users: 5, aiCallsPerDay: 0 }, isActive: true, sortOrder: 1 };

  function make(overrides: Record<string, unknown> = {}) {
    const prisma = {
      plan: { count: vi.fn().mockResolvedValue(3), findUnique: vi.fn().mockResolvedValue(plan), findMany: vi.fn().mockResolvedValue([plan]) },
      organization: { findUniqueOrThrow: vi.fn().mockResolvedValue({ planKey: 'FREE' }) },
      kPI: { count: vi.fn().mockResolvedValue(4) },
      dashboard: { count: vi.fn().mockResolvedValue(2) },
      user: { count: vi.fn().mockResolvedValue(7) },
      tenantQuota: { findUnique: vi.fn().mockResolvedValue(null) },
      ...overrides,
    };
    return { prisma, service: new BillingService(prisma as unknown as PrismaService) };
  }

  it('counts the people in the organisation — it used to report 0 from an unused counter (QA-M5)', async () => {
    const { prisma, service } = make();
    const status = await RequestContextStore.run(tenant, () => service.getStatus());
    expect(status.quotas.find((q) => q.key === 'users')).toEqual({ key: 'users', limit: 5, current: 7 });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', status: { notIn: ['ARCHIVED', 'DELETED', 'PURGED'] } },
    });
  });

  it('leaves out a quota nothing counts, instead of showing it at 0', async () => {
    const { service } = make();
    const status = await RequestContextStore.run(tenant, () => service.getStatus());
    expect(status.quotas.map((q) => q.key)).toEqual(['kpis', 'dashboards', 'users']);
  });

  it('uses the built-in limits for a built-in plan, so a catalog stored before a limit existed still has it', async () => {
    const stored = { key: 'FREE', displayName: 'Free', monthlyPriceUsd: 0, features: [], quotas: { kpis: 10, dashboards: 2 }, isActive: true, sortOrder: 1 };
    const { service } = make({
      plan: { count: vi.fn().mockResolvedValue(3), findUnique: vi.fn().mockResolvedValue(stored), findMany: vi.fn().mockResolvedValue([stored]) },
    });
    const status = await RequestContextStore.run(tenant, () => service.getStatus());
    expect(status.quotas.find((q) => q.key === 'users')).toMatchObject({ limit: 5 });
    expect(status.quotas.find((q) => q.key === 'dashboards')).toMatchObject({ limit: 3 });
  });

  it('lists the plans that can be chosen, in order', async () => {
    const { prisma, service } = make();
    const plans = await RequestContextStore.run(tenant, () => service.listPlans());
    expect(prisma.plan.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    expect(plans).toEqual([{ key: 'FREE', displayName: 'Free', monthlyPriceUsd: 0, features: [], quotas: { kpis: 10, dashboards: 3, users: 5 } }]);
  });
});
