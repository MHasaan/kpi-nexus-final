/** A money KPI created with no unit of its own takes the organisation's currency (flow walk: first use). */
import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpisService } from './kpis.service.js';

function make(currency: string) {
  const created = { id: 'k1', name: 'Sales', scope: 'ORG_WIDE' };
  const tx = {
    kPI: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'k1' })), findUniqueOrThrow: vi.fn(async () => created) },
    kPIVersion: { create: vi.fn(async () => undefined) },
  };
  const prisma = {
    organization: { findUnique: vi.fn(async () => ({ currency })) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const svc = new KpisService(
    prisma as never,
    { record: vi.fn(async () => {}) } as never,
    {} as never,
    { assertWithinQuota: vi.fn(async () => {}) } as never,
  );
  const create = (dto: Record<string, unknown>) =>
    RequestContextStore.run({ userId: 'me', organizationId: 'org_1', roleId: 'r', principalType: 'user' }, () =>
      svc.create({ name: 'Sales', scope: 'ORG_WIDE', ...dto } as never),
    );
  const storedUnit = () => tx.kPI.create.mock.calls[0]![0].data['unit'];
  return { create, storedUnit, prisma };
}

describe('KpisService.create → the unit of a money KPI', () => {
  it("takes the organisation's currency when none is typed", async () => {
    const { create, storedUnit, prisma } = make('PKR');
    await create({ type: 'CURRENCY' });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: 'org_1' }, select: { currency: true } });
    expect(storedUnit()).toBe('PKR');
  });

  it('keeps a unit that was typed, and does not look the currency up', async () => {
    const { create, storedUnit, prisma } = make('PKR');
    await create({ type: 'CURRENCY', unit: 'USD' });
    expect(storedUnit()).toBe('USD');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('gives another kind of KPI no unit', async () => {
    const { create, storedUnit, prisma } = make('PKR');
    await create({ type: 'COUNT' });
    expect(storedUnit()).toBeUndefined();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
