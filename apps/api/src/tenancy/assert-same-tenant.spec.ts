import { BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { assertSameTenant } from './assert-same-tenant.js';

describe('assertSameTenant (BE-021)', () => {
  const rows = [
    { id: 'k_a', organizationId: 'org_a' },
    { id: 'k_b', organizationId: 'org_b' },
  ];
  const findFirst = vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
    const r = rows.find((x) => x.id === where.id && x.organizationId === where.organizationId);
    return r ? { id: r.id } : null;
  });
  const prisma = { kPI: { findFirst } } as unknown as PrismaService;

  test('passes for a row in the caller tenant, scoping the lookup by org', async () => {
    await expect(assertSameTenant(prisma, 'kPI', 'k_a', 'org_a', 'kpiId')).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenLastCalledWith({ where: { id: 'k_a', organizationId: 'org_a' }, select: { id: true } });
  });

  test("400 VALIDATION_ERROR for another tenant's id (same message as a missing one)", async () => {
    const err = await assertSameTenant(prisma, 'kPI', 'k_b', 'org_a', 'kpiId').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'kpiId is invalid or belongs to another tenant',
    });
    await expect(assertSameTenant(prisma, 'kPI', 'nope', 'org_a', 'kpiId')).rejects.toBeInstanceOf(BadRequestException);
  });
});
