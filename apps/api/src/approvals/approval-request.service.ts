import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ApprovalEntityType, Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ApprovalApplyService } from './approval-apply.service.js';
import { type ApprovalDecision, resolveStatus } from './approval-status.js';

const requestSelect = {
  id: true,
  organizationId: true,
  workflowId: true,
  entityType: true,
  entityId: true,
  requesterUserId: true,
  proposedPayload: true,
  status: true,
  decisions: true,
  resolvedAt: true,
  createdAt: true,
} satisfies Prisma.ApprovalRequestSelect;

export type PublicApprovalRequest = Prisma.ApprovalRequestGetPayload<{ select: typeof requestSelect }>;

interface StoredDecision extends ApprovalDecision {
  comment?: string;
  decidedAt: string;
}

@Injectable()
export class ApprovalRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly apply: ApprovalApplyService,
  ) {}

  async list(filter: { status?: string; entityType?: ApprovalEntityType }): Promise<PublicApprovalRequest[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.approvalRequest.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
      },
      select: requestSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async decide(
    requestId: string,
    input: { decision: 'approve' | 'reject'; comment?: string },
  ): Promise<PublicApprovalRequest> {
    const ctx = RequestContextStore.require();
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, organizationId: ctx.organizationId, status: 'PENDING' },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pending approval request not found' });

    if (request.requesterUserId === ctx.userId) {
      throw new ForbiddenException({ code: 'SELF_APPROVAL', message: 'You cannot decide on your own request' });
    }

    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: { id: request.workflowId, organizationId: ctx.organizationId },
      select: { requiredApproverRoleIds: true, requireAll: true },
    });
    if (!workflow) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval workflow not found' });

    if (!ctx.roleId || !workflow.requiredApproverRoleIds.includes(ctx.roleId)) {
      throw new ForbiddenException({ code: 'NOT_AN_APPROVER', message: 'Your role is not an approver for this workflow' });
    }

    const decisions = (request.decisions as unknown as StoredDecision[]) ?? [];
    if (decisions.some((d) => d.userId === ctx.userId)) {
      throw new ForbiddenException({ code: 'ALREADY_DECIDED', message: 'You have already decided on this request' });
    }

    const nextDecisions: StoredDecision[] = [
      ...decisions,
      { userId: ctx.userId, decision: input.decision, comment: input.comment, decidedAt: new Date().toISOString() },
    ];

    const status = resolveStatus({
      requireAll: workflow.requireAll,
      requiredApproverCount: workflow.requiredApproverRoleIds.length,
      decisions: nextDecisions,
    });

    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        decisions: nextDecisions as unknown as Prisma.InputJsonValue,
        status,
        resolvedAt: status === 'PENDING' ? null : new Date(),
      },
      select: requestSelect,
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'ApprovalRequest',
      entityId: requestId,
      metadata: { decision: input.decision, status },
    });

    if (status === 'APPROVED') {
      await this.apply.apply({
        entityType: updated.entityType,
        entityId: updated.entityId,
        proposedPayload: updated.proposedPayload,
      });
    }

    return updated;
  }

  async cancel(requestId: string): Promise<PublicApprovalRequest> {
    const ctx = RequestContextStore.require();
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, organizationId: ctx.organizationId, status: 'PENDING' },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pending approval request not found' });
    if (request.requesterUserId !== ctx.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the requester can cancel this request' });
    }
    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
      select: requestSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'ApprovalRequest', entityId: requestId, metadata: { status: 'CANCELLED' } });
    return updated;
  }
}
