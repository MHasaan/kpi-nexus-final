import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
import { buildKpiVisibilityWhere, kpiContextFromProfile } from '../rbac/visibility/kpi-visibility.js';
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
    private readonly accessContext: AccessContextService,
  ) {}

  /**
   * KPI-visibility floor (a rule is visible only if its KPI is visible to the
   * principal) + ALERTS-scope createdById narrowing. Admin ⇒ unchanged. ORG ⇒
   * floor only. SELF/DIRECT_REPORTS/UNITS ⇒ createdById restricted to the scoped set.
   */
  private async applyVisibility(where: Prisma.AlertRuleWhereInput): Promise<Prisma.AlertRuleWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return where;

    const kpiWhere = buildKpiVisibilityWhere(
      kpiContextFromProfile(ctx.organizationId, ctx.userId, profile),
    ) as unknown as Prisma.KPIWhereInput;
    const visibleKpis = await this.prisma.kPI.findMany({ where: kpiWhere, select: { id: true } });
    const visibleIds = visibleKpis.map((k) => k.id);
    if (typeof where.kpiId === 'string') {
      where.kpiId = visibleIds.includes(where.kpiId) ? where.kpiId : { in: [] };
    } else {
      where.kpiId = { in: visibleIds };
    }

    const scope = profile.scopeByDomain.ALERTS ?? 'ORG';
    if (scope === 'SELF') {
      where.createdById = { in: [ctx.userId] };
    } else if (scope === 'DIRECT_REPORTS') {
      where.createdById = { in: [ctx.userId, ...profile.context.directReportIds] };
    } else if (scope === 'UNITS') {
      const ids = scopedUserIds('UNITS', {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: await this.accessContext.unitMemberUserIds(),
      })!;
      where.createdById = { in: ids };
    }
    // ORG ⇒ no createdById narrowing (floor only)
    return where;
  }

  async list(kpiId?: string): Promise<PublicAlertRule[]> {
    const ctx = RequestContextStore.require();
    let where: Prisma.AlertRuleWhereInput = { organizationId: ctx.organizationId };
    if (kpiId) where.kpiId = kpiId;
    where = await this.applyVisibility(where);
    return this.prisma.alertRule.findMany({
      where,
      select: alertRuleSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicAlertRule> {
    const ctx = RequestContextStore.require();
    const where = await this.applyVisibility({ id, organizationId: ctx.organizationId } as Prisma.AlertRuleWhereInput);
    const rule = await this.prisma.alertRule.findFirst({ where, select: alertRuleSelect });
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
