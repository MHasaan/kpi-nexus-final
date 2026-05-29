import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const alertSelect = {
  id: true,
  organizationId: true,
  alertRuleId: true,
  kpiId: true,
  message: true,
  severity: true,
  status: true,
  targetUserId: true,
  acknowledgedAt: true,
  acknowledgedById: true,
  resolvedAt: true,
  meta: true,
  createdAt: true,
} satisfies Prisma.AlertSelect;

export type PublicAlert = Prisma.AlertGetPayload<{ select: typeof alertSelect }>;

export interface ListAlertsFilter {
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  kpiId?: string;
  limit?: number;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: ListAlertsFilter = {}): Promise<PublicAlert[]> {
    const ctx = RequestContextStore.require();
    const where: Prisma.AlertWhereInput = { organizationId: ctx.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.severity) where.severity = filter.severity;
    if (filter.kpiId) where.kpiId = filter.kpiId;
    return this.prisma.alert.findMany({
      where,
      select: alertSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filter.limit ?? 100, 500),
    });
  }

  async getById(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    const alert = await this.prisma.alert.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: alertSelect,
    });
    if (!alert) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Alert not found' });
    }
    return alert;
  }

  async acknowledge(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    await this.getById(id);
    await this.prisma.alert.updateMany({
      where: { id, organizationId: ctx.organizationId, status: 'OPEN' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: ctx.userId },
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Alert', entityId: id, metadata: { status: 'ACKNOWLEDGED' } });
    return this.getById(id);
  }

  async resolve(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    await this.getById(id);
    await this.prisma.alert.updateMany({
      where: { id, organizationId: ctx.organizationId, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Alert', entityId: id, metadata: { status: 'RESOLVED' } });
    return this.getById(id);
  }

  async unreadCount(): Promise<number> {
    const ctx = RequestContextStore.require();
    return this.prisma.alert.count({
      where: { organizationId: ctx.organizationId, status: 'OPEN' },
    });
  }
}
