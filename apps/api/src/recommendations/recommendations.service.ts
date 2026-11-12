import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { KPIDirection, Recommendation, RecommendationStatus } from '@kpi-nexus/db';

import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { parseRecommendation } from './recommendation-parser.js';

const SYSTEM_PROMPT = [
  'You are a performance-improvement advisor. Given a KPI and its recent data, produce actionable advice.',
  'When a target and the latest on/off-target status are given, anchor your advice to closing the gap to that target.',
  'Respond with ONLY JSON: {"summary": string, "rootCauseHypotheses": string[], "suggestedActions": [{"action": string, "rationale": string, "priority": "P1"|"P2"|"P3"}], "confidence": number 0-1}.',
  'No prose outside the JSON.',
].join('\n');

/**
 * On/under/over-target status honoring direction — mirrors NLQ. Only meaningful
 * when a target is set and a value is present (caller guards). TARGET_IS_BEST /
 * NEUTRAL have no simple over/under reading, so they return null.
 */
function targetStatus(value: number, target: number, direction: KPIDirection): string | null {
  switch (direction) {
    case 'HIGHER_IS_BETTER':
      return value >= target ? 'on target' : 'below target';
    case 'LOWER_IS_BETTER':
      return value <= target ? 'on target' : 'above target';
    default:
      return null;
  }
}

/** Compact number formatting: keep integers integer, round others to 2dp. */
function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Percent change across a series: (last − first)/|first|, rounded to 1dp. */
function changePct(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (first === 0) return null; // undefined % change
  const pct = ((last - first) / Math.abs(first)) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

export interface GenerateInput {
  kpiId?: string;
  alertId?: string;
  anomalyId?: string;
}

/**
 * Generates AI recommendations for a KPI, optionally in response to an alert or
 * anomaly. The model's JSON is parsed by {@link parseRecommendation} (graceful
 * fallback to prose). `generateInOrg` is the fire-and-forget variant the alert
 * pipeline calls — it never throws so a recommendation failure can't break alert
 * delivery.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /** Resolve the KPI id from an explicit value or by looking up the alert. */
  private async resolveKpiId(organizationId: string, input: GenerateInput): Promise<string | null> {
    if (input.kpiId) return input.kpiId;
    if (input.alertId) {
      const alert = await this.prisma.alert.findFirst({
        where: { id: input.alertId, organizationId },
        select: { kpiId: true },
      });
      return alert?.kpiId ?? null;
    }
    return null;
  }

  async generate(input: GenerateInput): Promise<Recommendation> {
    const ctx = RequestContextStore.require();
    const kpiId = await this.resolveKpiId(ctx.organizationId, input);
    if (!kpiId) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'kpiId or a resolvable alertId is required' });

    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        unit: true,
        direction: true,
        targetValue: true,
        warningThreshold: true,
        criticalThreshold: true,
      },
    });
    if (!kpi) throw new NotFoundException({ code: 'KPI_NOT_FOUND', message: 'KPI not found' });

    const points = await this.prisma.kPIDataPoint.findMany({
      where: { organizationId: ctx.organizationId, kpiId },
      // Newest periods first ("latest" = newest period; entry time breaks ties).
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      take: 30,
      select: { value: true },
    });
    const values = points.map((p) => p.value).reverse();
    const latest = values.length > 0 ? values[values.length - 1]! : null;

    const userMsg = [
      `KPI: ${kpi.name}${kpi.unit ? ` (${kpi.unit})` : ''} (direction: ${kpi.direction})`,
      `Recent values (oldest→newest): ${values.join(', ') || 'none'}`,
      // Target + on/off-target status of the latest value, anchoring the advice.
      kpi.targetValue != null
        ? `Target: ${formatNum(kpi.targetValue)}${
            latest != null && targetStatus(latest, kpi.targetValue, kpi.direction)
              ? ` (latest is ${targetStatus(latest, kpi.targetValue, kpi.direction)})`
              : ''
          }`
        : null,
      // Thresholds (only those that are set).
      [
        kpi.warningThreshold != null ? `warning ${formatNum(kpi.warningThreshold)}` : null,
        kpi.criticalThreshold != null ? `critical ${formatNum(kpi.criticalThreshold)}` : null,
      ].some(Boolean)
        ? `Thresholds: ${[
            kpi.warningThreshold != null ? `warning ${formatNum(kpi.warningThreshold)}` : null,
            kpi.criticalThreshold != null ? `critical ${formatNum(kpi.criticalThreshold)}` : null,
          ]
            .filter(Boolean)
            .join(', ')}`
        : null,
      // Cheap % change over the window we already loaded.
      changePct(values) != null ? `Change over window (first→last): ${changePct(values)}%` : null,
      input.alertId ? 'This was triggered by an alert breach.' : null,
      input.anomalyId ? 'This was triggered by a confirmed anomaly.' : null,
      'Produce the recommendation JSON.',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.aiRouter.complete('RECOMMENDATIONS', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 700,
    });
    const content = parseRecommendation(result.content);

    return this.prisma.recommendation.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        alertId: input.alertId ?? null,
        anomalyId: input.anomalyId ?? null,
        content: content as unknown as object,
        confidence: content.confidence,
        status: 'PENDING',
      },
    });
  }

  /** Fire-and-forget for the alert/anomaly pipeline. Never throws. */
  async generateInOrg(input: GenerateInput): Promise<void> {
    try {
      await this.generate(input);
    } catch (err) {
      this.logger.warn(`auto-recommendation failed for kpi ${input.kpiId ?? input.alertId}: ${String(err)}`);
    }
  }

  async updateStatus(id: string, status: RecommendationStatus): Promise<Recommendation> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.recommendation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException({ code: 'RECOMMENDATION_NOT_FOUND', message: 'Recommendation not found' });
    if (status === 'PENDING') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Can only move to ACTIONED or DISMISSED' });
    }
    return this.prisma.recommendation.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolvedById: ctx.userId },
    });
  }

  async list(filter: { kpiId?: string; alertId?: string; status?: RecommendationStatus }): Promise<Recommendation[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.recommendation.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(filter.kpiId ? { kpiId: filter.kpiId } : {}),
        ...(filter.alertId ? { alertId: filter.alertId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
