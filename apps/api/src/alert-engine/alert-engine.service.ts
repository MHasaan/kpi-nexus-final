import { Injectable, Logger, Optional } from '@nestjs/common';
import type { AlertRule, Prisma } from '@kpi-nexus/db';

import { KpiWatchProducer } from '../kpi-watches/kpi-watch.producer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { EscalationsService } from '../escalations/escalations.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { NoDataConfig } from '../alert-rules/dto/alert-rule.dto.js';
import { type RuleInputs, evaluateRule, ruleNeeds } from './evaluators/evaluate-rule.js';
import { evaluateNoData } from './evaluators/no-data.js';

export interface EvaluateKpiParams {
  organizationId: string;
  kpiId: string;
  value: number;
  recordedAt: Date;
  /**
   * The row just written. It is left out of the history the std-dev and
   * rate-of-change rules look back over, and says which series (which unit,
   * which person) that history belongs to.
   */
  dataPointId?: string;
  /** Scopes the alert to a user for PER_USER KPIs. */
  targetUserId?: string | null;
}

/**
 * AlertEngineService — the testable core of alert evaluation. Pure dispatch +
 * cooldown + Alert persistence + realtime publish. No BullMQ here (the
 * processor wraps this); injectable so unit tests can drive it with a mocked
 * Prisma + Realtime.
 *
 * STATIC_THRESHOLD, DYNAMIC_STDDEV, RATE_OF_CHANGE and COMPOSITE are judged
 * when a value is recorded; NO_DATA by the cron scan. The earlier values the
 * statistical rules need are loaded once per KPI, and only when a rule asks.
 */
@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly escalations: EscalationsService,
    @Optional() private readonly watches?: KpiWatchProducer,
  ) {}

  /** Evaluate all data-point-triggered rules for a KPI after a new data point. */
  async evaluateKpi(params: EvaluateKpiParams): Promise<string[]> {
    const rules = await this.prisma.alertRule.findMany({
      where: { organizationId: params.organizationId, kpiId: params.kpiId, isActive: true },
    });

    if (rules.length === 0) return [];
    const inputs = await this.loadInputs(rules, params);

    const created: string[] = [];
    for (const rule of rules) {
      // NO_DATA is cron-driven, not data-point-driven: evaluateRule leaves it untriggered.
      const result = evaluateRule(rule.ruleType, rule.config, inputs);
      if (!result.triggered) continue;

      const alertId = await this.maybeCreateAlert(rule, result.message ?? 'Alert triggered', {
        targetUserId: params.targetUserId ?? null,
        value: params.value,
      });
      if (alertId) created.push(alertId);
    }
    return created;
  }

  /**
   * Gather what the rules are judged against. Threshold rules need only the
   * new value; std-dev rules the values before it (newest period first); each
   * rate-of-change window the value the KPI had that long before this one.
   * "Before" is within the same series: a unit's or a person's values are
   * never compared with another's.
   */
  private async loadInputs(rules: AlertRule[], params: EvaluateKpiParams): Promise<RuleInputs> {
    const needs = ruleNeeds(rules);
    const inputs: RuleInputs & { history: number[]; baselines: Map<number, number | null> } = {
      value: params.value,
      history: [],
      baselines: new Map(),
    };
    if (needs.historySize === 0 && needs.windows.size === 0) return inputs;

    const point = params.dataPointId
      ? await this.prisma.kPIDataPoint.findFirst({
          where: { organizationId: params.organizationId, kpiId: params.kpiId, id: params.dataPointId },
          select: { orgUnitId: true, userId: true },
        })
      : null;
    const series: Prisma.KPIDataPointWhereInput = {
      organizationId: params.organizationId,
      kpiId: params.kpiId,
      orgUnitId: point?.orgUnitId ?? null,
      userId: point ? point.userId : (params.targetUserId ?? null),
      ...(params.dataPointId ? { id: { not: params.dataPointId } } : {}),
    };

    if (needs.historySize > 0) {
      const rows = await this.prisma.kPIDataPoint.findMany({
        where: series,
        select: { value: true },
        orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
        take: needs.historySize,
      });
      inputs.history = rows.map((r) => r.value);
    }
    for (const windowMinutes of needs.windows) {
      const baseline = await this.prisma.kPIDataPoint.findFirst({
        where: { ...series, recordedAt: { lte: new Date(params.recordedAt.getTime() - windowMinutes * 60_000) } },
        select: { value: true },
        orderBy: { recordedAt: 'desc' },
      });
      inputs.baselines.set(windowMinutes, baseline?.value ?? null);
    }
    return inputs;
  }

  /**
   * Cron entry point: scan NO_DATA rules across every org that has one. Runs a
   * cross-tenant query under RLS bypass to find the distinct orgs, then
   * evaluates each org under its own context.
   */
  async scanAllNoData(now: Date = new Date()): Promise<number> {
    const orgs = await RequestContextStore.runWithBypass('nodata-scan', () =>
      this.prisma.alertRule.findMany({
        where: { ruleType: 'NO_DATA', isActive: true },
        select: { organizationId: true },
        distinct: ['organizationId'],
      }),
    );
    let total = 0;
    for (const { organizationId } of orgs) {
      const created = await RequestContextStore.run(
        {
          userId: 'alert-engine-system',
          organizationId,
          roleId: null,
          principalType: 'user',
          bypassRls: true,
        },
        () => this.scanNoDataForOrg(organizationId, now),
      );
      total += created.length;
    }
    return total;
  }

  /** Cron scan: evaluate NO_DATA rules for one org against current staleness. */
  async scanNoDataForOrg(organizationId: string, now: Date = new Date()): Promise<string[]> {
    const rules = await this.prisma.alertRule.findMany({
      where: { organizationId, ruleType: 'NO_DATA', isActive: true },
    });
    const created: string[] = [];
    for (const rule of rules) {
      const last = await this.prisma.kPIDataPoint.findFirst({
        where: { organizationId, kpiId: rule.kpiId },
        select: { recordedAt: true },
        orderBy: { recordedAt: 'desc' },
      });
      const result = evaluateNoData(
        rule.config as NoDataConfig,
        last?.recordedAt ?? null,
        now,
      );
      if (!result.triggered) continue;
      const alertId = await this.maybeCreateAlert(rule, result.message ?? 'No data', {});
      if (alertId) created.push(alertId);
    }
    return created;
  }

  /**
   * Create an Alert unless suppressed by the rule's cooldown window. Returns
   * the new alert id, or null when suppressed.
   */
  private async maybeCreateAlert(
    rule: AlertRule,
    message: string,
    extra: { targetUserId?: string | null; value?: number },
  ): Promise<string | null> {
    const cooldownMinutes = readCooldown(rule.config);
    if (cooldownMinutes > 0) {
      const since = new Date(Date.now() - cooldownMinutes * 60_000);
      const recent = await this.prisma.alert.findFirst({
        where: {
          organizationId: rule.organizationId,
          alertRuleId: rule.id,
          kpiId: rule.kpiId,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (recent) {
        this.logger.debug(
          `Alert suppressed by cooldown (${cooldownMinutes}m) for rule ${rule.id}`,
        );
        return null;
      }
    }

    const alert = await this.prisma.alert.create({
      data: {
        organizationId: rule.organizationId,
        alertRuleId: rule.id,
        kpiId: rule.kpiId,
        message,
        severity: rule.severity,
        status: 'OPEN',
        targetUserId: extra.targetUserId ?? null,
        meta: (extra.value !== undefined
          ? { value: extra.value }
          : undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, severity: true, kpiId: true, alertRuleId: true, createdAt: true },
    });
    // A fired rule is "threshold breached" for the KPI's watchers.
    await this.watches?.enqueue({ organizationId: rule.organizationId, kpiId: rule.kpiId, event: 'threshold_breached', actorUserId: null });

    try {
      await this.realtime.publish(rule.organizationId, {
        type: 'alert_triggered',
        alertId: alert.id,
        alertRuleId: alert.alertRuleId,
        kpiId: alert.kpiId,
        severity: alert.severity,
        message,
        createdAt: alert.createdAt.toISOString(),
      });
    } catch (err) {
      this.logger.warn(`AlertEngine: realtime publish failed for alert ${alert.id}: ${String(err)}`);
    }

    // Kick off escalation level 0 immediately. The escalation processor no-ops
    // when the rule has no escalation policy, and halts if the alert is acked.
    await this.escalations.enqueueLevel(alert.id, rule.organizationId, 0, 0);

    return alert.id;
  }
}

function readCooldown(config: unknown): number {
  if (config && typeof config === 'object' && 'cooldownMinutes' in config) {
    const v = (config as { cooldownMinutes?: unknown }).cooldownMinutes;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}
