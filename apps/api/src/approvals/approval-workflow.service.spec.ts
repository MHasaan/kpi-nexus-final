/**
 * ApprovalWorkflowService unit tests. One workflow per entityType per org via
 * upsert; org-scoped list.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ApprovalWorkflowService } from './approval-workflow.service.js';

interface FakeWf {
  id: string;
  organizationId: string;
  entityType: string;
  requiredApproverRoleIds: string[];
  requireAll: boolean;
  isActive: boolean;
}

class FakePrisma {
  private n = 1;
  wfs: FakeWf[] = [];

  approvalWorkflow = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.wfs.filter((w) => w.organizationId === where.organizationId),
    ),
    upsert: vi.fn(async ({ where, create, update }: { where: { organizationId_entityType: { organizationId: string; entityType: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.organizationId_entityType;
      const existing = this.wfs.find((w) => w.organizationId === key.organizationId && w.entityType === key.entityType);
      if (existing) {
        for (const k of Object.keys(update)) if (update[k] !== undefined) (existing as unknown as Record<string, unknown>)[k] = update[k];
        return existing;
      }
      const w: FakeWf = {
        id: `wf_${this.n++}`,
        organizationId: create.organizationId as string,
        entityType: create.entityType as string,
        requiredApproverRoleIds: (create.requiredApproverRoleIds as string[]) ?? [],
        requireAll: (create.requireAll as boolean) ?? false,
        isActive: (create.isActive as boolean) ?? false,
      };
      this.wfs.push(w);
      return w;
    }),
  };
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = { record: vi.fn(async () => {}) };
  return { service: new ApprovalWorkflowService(prisma as unknown as PrismaService, audit as unknown as AuditService), prisma };
}

describe('ApprovalWorkflowService', () => {
  test('upsert creates then updates the same row (one per entityType)', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.upsert('KPI_DEFINITION', { requiredApproverRoleIds: ['r1'], requireAll: false, isActive: true }));
    await withCtx({}, () => service.upsert('KPI_DEFINITION', { requiredApproverRoleIds: ['r1', 'r2'], requireAll: true, isActive: true }));
    expect(prisma.wfs).toHaveLength(1);
    expect(prisma.wfs[0]!.requiredApproverRoleIds).toEqual(['r1', 'r2']);
    expect(prisma.wfs[0]!.requireAll).toBe(true);
  });

  test('list is org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.upsert('KPI_DEFINITION', { requiredApproverRoleIds: ['r1'], isActive: true }));
    await withCtx({ organizationId: 'other' }, () => service.upsert('KPI_TARGET', { requiredApproverRoleIds: ['r9'], isActive: true }));
    const rows = await withCtx({}, () => service.list());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entityType).toBe('KPI_DEFINITION');
  });
});
