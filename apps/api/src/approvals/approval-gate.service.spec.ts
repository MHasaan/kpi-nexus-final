/**
 * ApprovalGateService unit tests. The seam other modules call before mutating.
 * Covers: no active workflow → no-op (caller proceeds); active workflow →
 * creates a PENDING ApprovalRequest and throws ApprovalRequiredException (202)
 * carrying the requestId; inactive workflow row → no-op.
 */
import { describe, expect, test, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@kpi-nexus/db';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ApprovalGateService } from './approval-gate.service.js';
import { ApprovalRequiredException } from './approval-required.exception.js';

interface FakeWorkflow {
  id: string;
  organizationId: string;
  entityType: string;
  requiredApproverRoleIds: string[];
  requireAll: boolean;
  isActive: boolean;
}
interface FakeRequest {
  id: string;
  organizationId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  requesterUserId: string;
  proposedPayload: unknown;
  currentPayload: unknown;
  status: string;
  decisions: unknown;
}

class FakePrisma {
  private rn = 1;
  workflows: FakeWorkflow[] = [];
  requests: FakeRequest[] = [];

  approvalWorkflow = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.workflows.find(
        (w) => w.organizationId === where.organizationId && w.entityType === where.entityType && (where.isActive === undefined || w.isActive === where.isActive),
      ) ?? null,
    ),
  };

  approvalRequest = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const r: FakeRequest = {
        id: `req_${this.rn++}`,
        organizationId: data.organizationId as string,
        workflowId: data.workflowId as string,
        entityType: data.entityType as string,
        entityId: data.entityId as string,
        requesterUserId: data.requesterUserId as string,
        proposedPayload: data.proposedPayload,
        currentPayload: data.currentPayload,
        status: 'PENDING',
        decisions: [],
      };
      this.requests.push(r);
      return r;
    }),
  };
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'requester', organizationId: ctx.organizationId ?? ORG, roleId: ctx.roleId ?? 'role_mgr', principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  return { service: new ApprovalGateService(prisma as unknown as PrismaService), prisma };
}

describe('ApprovalGateService.requireApprovalIfActive', () => {
  test('no workflow at all → resolves (caller proceeds), no request created', async () => {
    const { service, prisma } = makeService();
    await expect(withCtx({}, () => service.requireApprovalIfActive('KPI_DEFINITION', 'kpi_1', { name: 'x' }))).resolves.toBeUndefined();
    expect(prisma.requests).toHaveLength(0);
  });

  test('inactive workflow row → resolves (caller proceeds)', async () => {
    const { service, prisma } = makeService();
    prisma.workflows.push({ id: 'wf', organizationId: ORG, entityType: 'KPI_DEFINITION', requiredApproverRoleIds: ['r1'], requireAll: false, isActive: false });
    await expect(withCtx({}, () => service.requireApprovalIfActive('KPI_DEFINITION', 'kpi_1', { name: 'x' }))).resolves.toBeUndefined();
    expect(prisma.requests).toHaveLength(0);
  });

  test('active workflow → creates PENDING request and throws 202 with requestId', async () => {
    const { service, prisma } = makeService();
    prisma.workflows.push({ id: 'wf', organizationId: ORG, entityType: 'KPI_DEFINITION', requiredApproverRoleIds: ['r1'], requireAll: false, isActive: true });
    let thrown: unknown;
    try {
      await withCtx({ userId: 'mgr' }, () => service.requireApprovalIfActive('KPI_DEFINITION', 'kpi_9', { name: 'New' }));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApprovalRequiredException);
    expect((thrown as ApprovalRequiredException).getStatus()).toBe(HttpStatus.ACCEPTED);
    expect(prisma.requests).toHaveLength(1);
    const created = prisma.requests[0]!;
    expect(created.status).toBe('PENDING');
    expect(created.entityId).toBe('kpi_9');
    expect(created.requesterUserId).toBe('mgr');
    expect((thrown as ApprovalRequiredException).getResponse()).toMatchObject({ requestId: created.id });
  });

  test('active workflow → persists currentPayload (BEFORE state) on the request', async () => {
    const { service, prisma } = makeService();
    prisma.workflows.push({ id: 'wf', organizationId: ORG, entityType: 'KPI_DEFINITION', requiredApproverRoleIds: ['r1'], requireAll: false, isActive: true });
    const before = { id: 'kpi_9', name: 'Old name', targetValue: 100 };
    try {
      await withCtx({ userId: 'mgr' }, () =>
        service.requireApprovalIfActive('KPI_DEFINITION', 'kpi_9', { name: 'New' }, { currentPayload: before }),
      );
    } catch {
      // ApprovalRequiredException expected — assert persistence below.
    }
    expect(prisma.requests).toHaveLength(1);
    expect(prisma.requests[0]!.currentPayload).toEqual(before);
    expect(prisma.requests[0]!.proposedPayload).toEqual({ name: 'New' });
  });

  test('active workflow with no currentPayload (create) → stores Json null, not the proposed payload', async () => {
    const { service, prisma } = makeService();
    prisma.workflows.push({ id: 'wf', organizationId: ORG, entityType: 'KPI_TARGET', requiredApproverRoleIds: ['r1'], requireAll: false, isActive: true });
    try {
      await withCtx({ userId: 'mgr' }, () => service.requireApprovalIfActive('KPI_TARGET', 'kpi_9', { kind: 'create' }));
    } catch {
      // ApprovalRequiredException expected.
    }
    expect(prisma.requests).toHaveLength(1);
    expect(prisma.requests[0]!.currentPayload).toBe(Prisma.JsonNull);
  });

  test('bypass option → no-op even with active workflow', async () => {
    const { service, prisma } = makeService();
    prisma.workflows.push({ id: 'wf', organizationId: ORG, entityType: 'KPI_DEFINITION', requiredApproverRoleIds: ['r1'], requireAll: false, isActive: true });
    await expect(
      withCtx({}, () => service.requireApprovalIfActive('KPI_DEFINITION', 'kpi_1', { name: 'x' }, { bypassApproval: true })),
    ).resolves.toBeUndefined();
    expect(prisma.requests).toHaveLength(0);
  });
});
