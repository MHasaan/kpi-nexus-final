import { Injectable, Logger } from '@nestjs/common';
import type { AlertRule, Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { EscalationsService } from '../escalations/escalations.service.js';
import type {
  NoDataConfig,
  StaticThresholdConfig,
} from '../alert-rules/dto/alert-rule.dto.js';
import { evaluateNoData } from './evaluators/no-data.js';
import { evaluateStaticThreshold } from './evaluators/static-threshold.js';
import { notTriggered, type EvaluationResult } from './evaluators/types.js';

export interface EvaluateKpiParams {
  organizationId: string;
  kpiId: string;
  value: number;
  recordedAt: Date;
  /** Scopes the alert to a user for PER_USER KPIs. */
  targetUserId?: string | null;
}

/**
 * AlertEngineService — the testable core of alert evaluation. Pure dispatch +
 * cooldown + Alert persistence + realtime publish. No BullMQ here (the
 * processor wraps this); injectable so unit tests can drive it with a mocked
 * Prisma + Realtime.
 *
 * P4 implements STATIC_THRESHOLD (data-point triggered) + NO_DATA (cron). The
 * DYNAMIC_STDDEV / RATE_OF_CHANGE / COMPOSITE evaluators short-circuit to "no
 * trigger" until P5.
 */
@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly escalations: EscalationsService,
  ) {}

  /** Evaluate all data-point-triggered rules for a KPI after a new data point. */
  async evaluateKpi(params: EvaluateKpiParams): Promise<string[]> {
    const rules = await this.prisma.alertRule.findMany({
      where: { organizationId: params.organizationId, kpiId: params.kpiId, isActive: true },
    });

    const created: string[] = [];
    for (const rule of rules) {
      let result: EvaluationResult = notTriggered;
      if (rule.ruleType === 'STATIC_THRESHOLD') {
        result = evaluateStaticThreshold(rule.config as StaticThresholdConfig, params.value);
      }
      // NO_DATA is cron-driven, not data-point-driven. Other types stubbed (P5).
      if (!result.triggered) continue;

      const alertId = await this.maybeCreateAlert(rule, result.message ?? 'Alert triggered', {
        targetUserId: params.targetUserId ?? null,
        value: params.value,
      });
      if (alertId) created.push(alertId);
    }
    return created;
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
