import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Recommendation, RecommendationStatus } from '@kpi-nexus/db';

import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { parseRecommendation } from './recommendation-parser.js';

const SYSTEM_PROMPT = [
  'You are a performance-improvement advisor. Given a KPI and its recent data, produce actionable advice.',
  'Respond with ONLY JSON: {"summary": string, "rootCauseHypotheses": string[], "suggestedActions": [{"action": string, "rationale": string, "priority": "P1"|"P2"|"P3"}], "confidence": number 0-1}.',
  'No prose outside the JSON.',
].join('\n');

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
      select: { id: true, name: true, direction: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'KPI_NOT_FOUND', message: 'KPI not found' });

    const points = await this.prisma.kPIDataPoint.findMany({
      where: { organizationId: ctx.organizationId, kpiId },
      orderBy: { recordedAt: 'desc' },
      take: 30,
      select: { value: true },
    });
    const values = points.map((p) => p.value).reverse();

    const userMsg = [
      `KPI: ${kpi.name} (direction: ${kpi.direction})`,
      `Recent values (oldest→newest): ${values.join(', ') || 'none'}`,
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
