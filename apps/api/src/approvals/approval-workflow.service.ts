import { Injectable } from '@nestjs/common';
import type { ApprovalEntityType, Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const workflowSelect = {
  id: true,
  organizationId: true,
  entityType: true,
  requiredApproverRoleIds: true,
  requireAll: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ApprovalWorkflowSelect;

export type PublicApprovalWorkflow = Prisma.ApprovalWorkflowGetPayload<{ select: typeof workflowSelect }>;

export interface UpsertWorkflowInput {
  requiredApproverRoleIds: string[];
  requireAll?: boolean;
  isActive?: boolean;
}

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicApprovalWorkflow[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.approvalWorkflow.findMany({
      where: { organizationId: ctx.organizationId },
      select: workflowSelect,
      orderBy: [{ entityType: 'asc' }],
    });
  }

  /** One workflow per (org, entityType) — PUT semantics. */
  async upsert(entityType: ApprovalEntityType, input: UpsertWorkflowInput): Promise<PublicApprovalWorkflow> {
    const ctx = RequestContextStore.require();
    const result = await this.prisma.approvalWorkflow.upsert({
      where: { organizationId_entityType: { organizationId: ctx.organizationId, entityType } },
      create: {
        organizationId: ctx.organizationId,
        entityType,
        requiredApproverRoleIds: input.requiredApproverRoleIds,
        requireAll: input.requireAll ?? false,
        isActive: input.isActive ?? false,
      },
      update: {
        requiredApproverRoleIds: input.requiredApproverRoleIds,
        requireAll: input.requireAll,
        isActive: input.isActive,
      },
      select: workflowSelect,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'ApprovalWorkflow',
      entityId: result.id,
      metadata: { entityType, isActive: result.isActive },
    });
    return result;
  }
}
