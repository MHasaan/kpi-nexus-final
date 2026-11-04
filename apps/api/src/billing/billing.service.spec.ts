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
