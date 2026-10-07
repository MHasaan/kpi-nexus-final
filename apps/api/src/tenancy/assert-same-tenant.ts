import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';

/** Tenant-scoped models a client may reference by id from another entity. */
export type TenantRefModel = 'kPI' | 'alert' | 'user' | 'task' | 'dashboard' | 'objective' | 'comment';

type FindFirstDelegate = {
  findFirst(args: { where: { id: string; organizationId: string }; select: { id: true } }): Promise<{ id: string } | null>;
};

/**
 * 400 unless `id` is a row of `model` in `organizationId` (BE-021).
 *
 * Reads are already tenant-scoped, but writes used to store ids from another
 * tenant verbatim (e.g. a task pointing at org A's KPI, created by org B) —
 * dangling cross-tenant references. Same error shape as the existing checks
 * in OrgUnitsService.create.
 */
export async function assertSameTenant(
  prisma: PrismaService,
  model: TenantRefModel,
  id: string,
  organizationId: string,
  field: string,
): Promise<void> {
  const delegate = (prisma as unknown as Record<TenantRefModel, FindFirstDelegate>)[model];
  const row = await delegate.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `${field} is invalid or belongs to another tenant`,
    });
  }
}
