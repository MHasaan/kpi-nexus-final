/**
 * BE-045: GET /user-kpis/user/:id treats a person outside the caller's PEOPLE
 * scope as absent (404, BE-004), but assign and unassign did not look — so a
 * manager scoped to their own team could give a KPI to, or take one from,
 * anyone in the organisation whose id they knew.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UserKpisService } from './user-kpis.service.js';

const ORG = 'org-1';
const ctx = { organizationId: ORG, userId: 'manager' } as RequestContext;

function make(visible: string[] | null) {
  const assignments = [{ id: 'asg-outsider', organizationId: ORG, userId: 'outsider', kpiId: 'kpi-1' }];
  const upsert = vi.fn(async () => ({ id: 'asg-new' }));
  const del = vi.fn(async () => ({}));
  const prisma = {
    kPI: { findFirst: vi.fn(async () => ({ id: 'kpi-1', scope: 'PER_USER' })) },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        ['report', 'outsider'].includes(where.id) ? { id: where.id } : null,
      ),
    },
    kPIAssignmentUser: {
      upsert,
      delete: del,
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        assignments.find((a) => a.id === where.id && a.organizationId === where.organizationId) ?? null,
      ),
    },
  };
  const accessContext = {
    isPersonVisible: vi.fn(async (id: string) => visible === null || visible.includes(id)),
  };
  const service = new UserKpisService(
    prisma as unknown as PrismaService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, upsert, del };
}

const run = async <T,>(fn: () => Promise<T>) => RequestContextStore.run(ctx, fn);

describe('UserKpisService — PEOPLE scope on assign and unassign (BE-045)', () => {
  test('assigning to someone outside the caller\'s scope is a 404, and nothing is written', async () => {
    const { service, upsert } = make(['manager', 'report']);
    await expect(run(() => service.assign({ kpiId: 'kpi-1', userId: 'outsider' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });

  test('assigning to someone in scope works', async () => {
    const { service, upsert } = make(['manager', 'report']);
    await expect(run(() => service.assign({ kpiId: 'kpi-1', userId: 'report' }))).resolves.toEqual({ id: 'asg-new' });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  test('unassigning from someone outside the caller\'s scope is a 404, and nothing is deleted', async () => {
    const { service, del } = make(['manager', 'report']);
    await expect(run(() => service.unassign('asg-outsider'))).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });

  test('with no scope restriction (ORG / admin) both work for anyone', async () => {
    const { service, upsert, del } = make(null);
    await run(() => service.assign({ kpiId: 'kpi-1', userId: 'outsider' }));
    await run(() => service.unassign('asg-outsider'));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
