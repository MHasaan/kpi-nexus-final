/**
 * BE-056: a position's `orgUnitId` was stored as sent — an id that is not an
 * org unit of the organisation, including another organisation's, was accepted.
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { PositionsService } from './positions.service.js';

const ORG = 'org_alpha';
const ctx: RequestContext = { organizationId: ORG, userId: 'u1', roleId: null, principalType: 'user' };
const run = <T>(fn: () => Promise<T>) => RequestContextStore.run(ctx, fn);

function make() {
  const units = [
    { id: 'unit_ours', organizationId: ORG },
    { id: 'unit_theirs', organizationId: 'org_beta' },
  ];
  const positions: Array<Record<string, unknown>> = [{ id: 'pos_1', organizationId: ORG, name: 'Engineer', orgUnitId: null }];
  const prisma = {
    orgUnit: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        units.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null,
      ),
    },
    position: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        positions.find((p) => p.id === where.id && p.organizationId === where.organizationId) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `pos_${positions.length + 1}`, ...data };
        positions.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = positions.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return { service: new PositionsService(prisma as unknown as PrismaService), prisma, positions };
}

describe('PositionsService — a position belongs to an org unit of its own organisation (BE-056)', () => {
  test("create refuses another organisation's unit, and an id that is no unit; nothing is written", async () => {
    const { service, prisma } = make();
    for (const orgUnitId of ['unit_theirs', 'no-such-unit']) {
      await expect(run(() => service.create({ name: 'Lead', level: 1, isActive: true, orgUnitId }))).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.position.create).not.toHaveBeenCalled();
  });

  test("update refuses another organisation's unit and leaves the position as it was", async () => {
    const { service, positions } = make();
    await expect(run(() => service.update('pos_1', { orgUnitId: 'unit_theirs' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(positions[0]!.orgUnitId).toBeNull();
  });

  test('a unit of the organisation is accepted on create and on update; no unit needs no check', async () => {
    const { service, prisma, positions } = make();
    await run(() => service.create({ name: 'Lead', level: 1, isActive: true, orgUnitId: 'unit_ours' }));
    await run(() => service.update('pos_1', { orgUnitId: 'unit_ours' }));
    expect(positions[0]!.orgUnitId).toBe('unit_ours');
    prisma.orgUnit.findFirst.mockClear();
    await run(() => service.create({ name: 'Analyst', level: 1, isActive: true }));
    await run(() => service.update('pos_1', { level: 3 }));
    expect(prisma.orgUnit.findFirst).not.toHaveBeenCalled();
  });
});
