import { Injectable } from '@nestjs/common';
import { Prisma } from '@kpi-nexus/db';
import type { ApprovalEntityType } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ApprovalRequiredException } from './approval-required.exception.js';

export interface RequireApprovalOptions {
  /** When true, skip the gate entirely (internal replay via ApprovalApplyService). */
  bypassApproval?: boolean;
  /**
   * Snapshot of the entity's state BEFORE the proposed change so the approver UI
   * can render a before→after diff. Undefined (e.g. on creates) is stored as null.
   */
  currentPayload?: unknown;
}

/**
 * The approval seam. Domain services (KPIs, KPI targets, roles) call
 * `requireApprovalIfActive` before mutating. If an active workflow exists for
 * the entity type, a PENDING ApprovalRequest is recorded and a 202 is thrown so
 * the mutation does not proceed. Depends only on Prisma so it can be imported by
 * domain modules without a circular dependency on the apply side.
 */
@Injectable()
export class ApprovalGateService {
  constructor(private readonly prisma: PrismaService) {}

  async requireApprovalIfActive(
    entityType: ApprovalEntityType,
    entityId: string,
    proposedPayload: unknown,
    opts: RequireApprovalOptions = {},
  ): Promise<void> {
    if (opts.bypassApproval) return;
    const ctx = RequestContextStore.require();

    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: { organizationId: ctx.organizationId, entityType, isActive: true },
      select: { id: true },
    });
    if (!workflow) return;

    const request = await this.prisma.approvalRequest.create({
      data: {
        organizationId: ctx.organizationId,
        workflowId: workflow.id,
        entityType,
        entityId,
        requesterUserId: ctx.userId,
        proposedPayload: proposedPayload as Prisma.InputJsonValue,
        // BEFORE-state snapshot for the approver diff; undefined (creates) → null.
        currentPayload:
          opts.currentPayload === undefined
            ? Prisma.JsonNull
            : (opts.currentPayload as Prisma.InputJsonValue),
      },
      select: { id: true },
    });

    throw new ApprovalRequiredException(request.id);
  }
}
