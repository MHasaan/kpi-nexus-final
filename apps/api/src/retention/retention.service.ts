import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { RETENTION_ENTITY_TYPES, RETENTION_TIERS, type RetentionTier, resolveTierDays } from './retention-tiers.js';

const policySelect = {
  id: true,
  organizationId: true,
  entityType: true,
  days: true,
} satisfies Prisma.RetentionPolicySelect;

export type PublicRetentionPolicy = Prisma.RetentionPolicyGetPayload<{ select: typeof policySelect }>;

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicRetentionPolicy[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.retentionPolicy.findMany({ where: { organizationId: ctx.organizationId }, select: policySelect, orderBy: [{ entityType: 'asc' }] });
  }

  listTiers(): Array<{ tier: RetentionTier; days: number }> {
    return (Object.keys(RETENTION_TIERS) as RetentionTier[]).map((tier) => ({ tier, days: RETENTION_TIERS[tier] }));
  }

  /** One-click: set every entity type's retention to the tier's day count. */
  async applyTier(tier: RetentionTier): Promise<PublicRetentionPolicy[]> {
    const ctx = RequestContextStore.require();
    const days = resolveTierDays(tier);
    for (const entityType of RETENTION_ENTITY_TYPES) {
      await this.prisma.retentionPolicy.upsert({
        where: { organizationId_entityType: { organizationId: ctx.organizationId, entityType } },
        create: { organizationId: ctx.organizationId, entityType, days },
        update: { days },
      });
    }
    await this.audit.record({ action: 'UPDATE', entityType: 'RetentionPolicy', entityId: tier, metadata: { tier, days } });
    return this.list();
  }
}
