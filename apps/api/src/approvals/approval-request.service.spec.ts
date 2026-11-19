/**
 * ApprovalRequestService unit tests. Focuses on the decide() flow: approver-role
 * validation, self-approval refusal, duplicate-decision refusal, requireAll
 * accumulation, and firing ApprovalApplyService once APPROVED. Plus cancel()
 * (requester-only, PENDING-only).
 */
import { describe, expect, test, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import type { ApprovalApplyService } from './approval-apply.service.js';
import { ApprovalRequestService } from './approval-request.service.js';

interface FakeWorkflow {
  id: string;
  organizationId: string;
  entityType: string;
  requiredApproverRoleIds: string[];
  requireAll: boolean;
}
interface FakeRequest {
  id: string;
  organizationId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  requesterUserId: string;
  proposedPayload: unknown;
  status: string;
  decisions: Array<{ userId: string; decision: string; comment?: string; decidedAt: string }>;
  resolvedAt: Date | null;
}

class FakePrisma {
  workflows: FakeWorkflow[] = [];
  requests: FakeRequest[] = [];

  approvalWorkflow = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.workflows.find((w) => w.id === where.id && w.organizationId === where.organizationId) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
      this.workflows.filter((w) => w.organizationId === where.organizationId),
    ),
  };
  // Names the inbox shows; each lookup is scoped to the organisation it is asked for.
  names = {
    user: [{ id: 'manager', organizationId: 'org_alpha', fullName: 'Mia Manager' }],
    kPI: [{ id: 'kpi_1', organizationId: 'org_alpha', name: 'Monthly Revenue' }],
    roleDefinition: [{ id: 'role_x', organizationId: 'org_alpha', name: 'Analyst' }],
  };
  private named = <T extends { id: string; organizationId: string }>(rows: T[]) =>
    vi.fn(async ({ where }: { where: { organizationId: string; id: { in: string[] } } }) =>
      rows.filter((r) => r.organizationId === where.organizationId && where.id.in.includes(r.id)),
    );
  // Who holds which role, and which roles are administrators: whether anyone but the requester could decide.
  people: Array<{ id: string; organizationId: string; status: string; roleId: string | null }> = [];
  adminRoles = new Set<string>();
  user = {
    findMany: this.named(this.names.user),
    count: vi.fn(async ({ where }: { where: { organizationId: string; status: string; id: { not: string }; roleId: { in: string[] } } }) =>
      this.people.filter(
        (p) => p.organizationId === where.organizationId && p.status === where.status && p.id !== where.id.not && p.roleId !== null && where.roleId.in.includes(p.roleId),
      ).length,
    ),
  };
  kPI = { findMany: this.named(this.names.kPI) };
  roleDefinition = {
    findMany: this.named(this.names.roleDefinition),
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      where.organizationId === 'org_alpha' && this.adminRoles.has(where.id) ? { isAdmin: true } : where.organizationId === 'org_alpha' ? { isAdmin: false } : null,
    ),
  };

  approvalRequest = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.requests.find(
        (r) => r.id === where.id && r.organizationId === where.organizationId && (where.status === undefined || r.status === where.status),
      ) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.requests.filter(
        (r) =>
          r.organizationId === where.organizationId &&
          (where.status === undefined || r.status === where.status) &&
          (where.entityType === undefined || r.entityType === where.entityType),
      ),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = this.requests.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) (r as unknown as Record<string, unknown>)[k] = data[k];
      return r;
    }),
  };
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'approver', organizationId: ctx.organizationId ?? ORG, roleId: ctx.roleId ?? 'role_appr', principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const apply = { apply: vi.fn(async () => {}) };
  const audit = { record: vi.fn(async () => {}) };
  const service = new ApprovalRequestService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    apply as unknown as ApprovalApplyService,
  );
  return { service, prisma, apply };
}

function seedPending(prisma: FakePrisma, opts: { requireAll?: boolean; roleIds?: string[]; requester?: string } = {}): FakeRequest {
  prisma.workflows.push({
    id: 'wf_1',
    organizationId: ORG,
    entityType: 'KPI_DEFINITION',
    requiredApproverRoleIds: opts.roleIds ?? ['role_appr'],
    requireAll: opts.requireAll ?? false,
  });
  const r: FakeRequest = {
    id: 'req_1',
    organizationId: ORG,
    workflowId: 'wf_1',
    entityType: 'KPI_DEFINITION',
    entityId: 'kpi_1',
    requesterUserId: opts.requester ?? 'manager',
    proposedPayload: { name: 'New' },
    status: 'PENDING',
    decisions: [],
    resolvedAt: null,
  };
  prisma.requests.push(r);
  return r;
}

describe('ApprovalRequestService.decide', () => {
  test('approver in required role approves single-approver workflow → APPROVED + apply fired', async () => {
    const { service, prisma, apply } = makeService();
    seedPending(prisma, { roleIds: ['role_appr'] });
    await withCtx({ userId: 'approver', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' }));
    expect(prisma.requests[0]!.status).toBe('APPROVED');
    expect(apply.apply).toHaveBeenCalledTimes(1);
  });

  test('rejection → REJECTED and apply NOT fired', async () => {
    const { service, prisma, apply } = makeService();
    seedPending(prisma, { roleIds: ['role_appr'] });
    await withCtx({ userId: 'approver', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'reject', comment: 'no' }));
    expect(prisma.requests[0]!.status).toBe('REJECTED');
    expect(apply.apply).not.toHaveBeenCalled();
  });

  test('user whose role is not a required approver → Forbidden', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma, { roleIds: ['role_compliance'] });
    await expect(
      withCtx({ userId: 'x', roleId: 'role_other' }, () => service.decide('req_1', { decision: 'approve' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('requester cannot approve their own request', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma, { roleIds: ['role_appr'], requester: 'self' });
    await expect(
      withCtx({ userId: 'self', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Flow walk: an organisation with one administrator who turned approvals on could never get a change
  // through — they could not decide their own request, and there was nobody else who could.
  describe('a sole administrator', () => {
    const soleAdmin = (prisma: FakePrisma, others: Array<{ id: string; status: string; roleId: string }> = []) => {
      prisma.adminRoles.add('role_admin');
      prisma.people.push({ id: 'self', organizationId: ORG, status: 'ACTIVE', roleId: 'role_admin' });
      for (const o of others) prisma.people.push({ ...o, organizationId: ORG });
      seedPending(prisma, { roleIds: ['role_admin'], requester: 'self' });
    };

    test('may decide their own request when nobody else could; the decision says so', async () => {
      const { service, prisma, apply } = makeService();
      soleAdmin(prisma, [{ id: 'gone', status: 'ARCHIVED', roleId: 'role_admin' }, { id: 'emp', status: 'ACTIVE', roleId: 'role_emp' }]);
      const res = await withCtx({ userId: 'self', roleId: 'role_admin' }, () => service.decide('req_1', { decision: 'approve' }));
      expect(res.status).toBe('APPROVED');
      expect(apply.apply).toHaveBeenCalledOnce();
      expect((res.decisions as unknown as Array<{ userId: string; ownRequest?: boolean }>)[0]).toMatchObject({ userId: 'self', ownRequest: true });
    });

    test('may not while another active person holds an approving role', async () => {
      const { service, prisma } = makeService();
      soleAdmin(prisma, [{ id: 'other_admin', status: 'ACTIVE', roleId: 'role_admin' }]);
      await expect(
        withCtx({ userId: 'self', roleId: 'role_admin' }, () => service.decide('req_1', { decision: 'approve' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    test('someone who is not an administrator may not decide their own request, even as the only approver', async () => {
      const { service, prisma } = makeService();
      prisma.people.push({ id: 'self', organizationId: ORG, status: 'ACTIVE', roleId: 'role_appr' });
      seedPending(prisma, { roleIds: ['role_appr'], requester: 'self' });
      await expect(
        withCtx({ userId: 'self', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    test('sees in the list that they can decide it', async () => {
      const { service, prisma } = makeService();
      soleAdmin(prisma);
      const [row] = await withCtx({ userId: 'self', roleId: 'role_admin' }, () => service.list({}));
      expect(row).toMatchObject({ canDecide: true, ownRequest: true });
    });
  });

  test('a user cannot decide twice', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma, { requireAll: true, roleIds: ['role_appr', 'role_b'] });
    await withCtx({ userId: 'approver', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' }));
    await expect(
      withCtx({ userId: 'approver', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('requireAll: stays PENDING until all approver roles approve, then applies', async () => {
    const { service, prisma, apply } = makeService();
    seedPending(prisma, { requireAll: true, roleIds: ['role_appr', 'role_b'] });
    await withCtx({ userId: 'u1', roleId: 'role_appr' }, () => service.decide('req_1', { decision: 'approve' }));
    expect(prisma.requests[0]!.status).toBe('PENDING');
    expect(apply.apply).not.toHaveBeenCalled();
    await withCtx({ userId: 'u2', roleId: 'role_b' }, () => service.decide('req_1', { decision: 'approve' }));
    expect(prisma.requests[0]!.status).toBe('APPROVED');
    expect(apply.apply).toHaveBeenCalledTimes(1);
  });

  test('deciding a non-pending / missing request → 404', async () => {
    const { service } = makeService();
    await expect(
      withCtx({ userId: 'approver', roleId: 'role_appr' }, () => service.decide('ghost', { decision: 'approve' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ApprovalRequestService.cancel', () => {
  test('requester can cancel a pending request', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma, { requester: 'manager' });
    await withCtx({ userId: 'manager' }, () => service.cancel('req_1'));
    expect(prisma.requests[0]!.status).toBe('CANCELLED');
  });

  test('non-requester cannot cancel → Forbidden', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma, { requester: 'manager' });
    await expect(withCtx({ userId: 'someone' }, () => service.cancel('req_1'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// UI-008: the inbox says who asked, what about, and whether the reader can decide.
describe('ApprovalRequestService.list', () => {
  test('an approver sees the request with the requester, the KPI by name, and that they can decide', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma);
    const [view] = await withCtx({}, () => service.list({ status: 'PENDING' }));
    expect(view).toMatchObject({ id: 'req_1', canDecide: true, requesterName: 'Mia Manager', entityLabel: 'Monthly Revenue' });
  });

  test('the requester sees their own request, and cannot decide it', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma);
    const [view] = await withCtx({ userId: 'manager', roleId: 'role_appr' }, () => service.list({}));
    expect(view!.canDecide).toBe(false);
  });

  test('someone whose role does not approve sees it without the power to decide', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma);
    const [view] = await withCtx({ userId: 'viewer', roleId: 'role_other' }, () => service.list({}));
    expect(view!.canDecide).toBe(false);
  });

  test('a request about something that no longer exists has no label, not an error', async () => {
    const { service, prisma } = makeService();
    const r = seedPending(prisma);
    r.entityId = 'deleted_kpi';
    r.requesterUserId = 'left_the_company';
    const [view] = await withCtx({}, () => service.list({}));
    expect(view).toMatchObject({ entityLabel: null, requesterName: null });
  });

  test('another organisation sees none of it', async () => {
    const { service, prisma } = makeService();
    seedPending(prisma);
    expect(await withCtx({ organizationId: 'other' }, () => service.list({}))).toEqual([]);
  });
});
