import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type {
  CreateAlertRuleDto,
  EscalationLevel,
  UpdateAlertRuleDto,
} from './dto/alert-rule.dto.js';

const alertRuleSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  name: true,
  description: true,
  ruleType: true,
  config: true,
  severity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  escalationRule: {
    select: { id: true, levels: true, createdAt: true, updatedAt: true },
  },
} satisfies Prisma.AlertRuleSelect;

export type PublicAlertRule = Prisma.AlertRuleGetPayload<{
  select: typeof alertRuleSelect;
}>;

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(kpiId?: string): Promise<PublicAlertRule[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.alertRule.findMany({
      where: { organizationId: ctx.organizationId, ...(kpiId ? { kpiId } : {}) },
      select: alertRuleSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicAlertRule> {
    const ctx = RequestContextStore.require();
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: alertRuleSelect,
    });
    if (!rule) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Alert rule not found' });
    }
    return rule;
  }

  async create(dto: CreateAlertRuleDto): Promise<PublicAlertRule> {
    const ctx = RequestContextStore.require();
    // Confirm the KPI belongs to this tenant before binding a rule to it.
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: dto.kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }

    const created = await this.prisma.alertRule.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId: dto.kpiId,
        name: dto.name,
        description: dto.description,
        ruleType: dto.ruleType,
        config: dto.config as Prisma.InputJsonValue,
        severity: dto.severity,
        isActive: dto.isActive,
        createdById: ctx.userId,
        ...(dto.escalationLevels && dto.escalationLevels.length > 0
          ? {
              escalationRule: {
                create: {
                  organizationId: ctx.organizationId,
                  levels: normalizeLevels(dto.escalationLevels) as Prisma.InputJsonValue,
                },
              },
            }
          : {}),
      },
      select: alertRuleSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'AlertRule',
      entityId: created.id,
      metadata: { name: created.name, ruleType: created.ruleType, kpiId: created.kpiId },
    });
    return created;
  }

  async update(id: string, dto: UpdateAlertRuleDto): Promise<PublicAlertRule> {
    const ctx = RequestContextStore.require();
    await this.getById(id); // tenant + existence check

    await this.prisma.alertRule.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        severity: dto.severity,
        isActive: dto.isActive,
      },
    });

    // Upsert escalation policy when provided. An empty array clears it.
    if (dto.escalationLevels !== undefined) {
      if (dto.escalationLevels.length === 0) {
        await this.prisma.escalationRule.deleteMany({ where: { alertRuleId: id } });
      } else {
        const levels = normalizeLevels(dto.escalationLevels) as Prisma.InputJsonValue;
        await this.prisma.escalationRule.upsert({
          where: { alertRuleId: id },
          create: { organizationId: ctx.organizationId, alertRuleId: id, levels },
          update: { levels },
        });
      }
    }

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'AlertRule',
      entityId: id,
      metadata: { name: dto.name },
    });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // tenant + existence check
    await this.prisma.alertRule.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'AlertRule', entityId: id });
  }
}

// Drop escalation levels whose recipients are all empty — an empty level would
// fire nothing. Matches the FE EscalationBuilder serialize behavior.
function normalizeLevels(levels: EscalationLevel[]): EscalationLevel[] {
  return levels.filter(
    (l) =>
      l.channelIds.length > 0 ||
      l.notifyRoleIds.length > 0 ||
      l.notifyUserIds.length > 0,
  );
}
