import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { KPIInsight } from '@kpi-nexus/db';

import { AiConfigsService } from '../ai/ai-configs.service.js';
import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type WindowStats, computeWindowStats, rankByAbsChange } from './insight-stats.js';

const POINTS_WINDOW = 90;

/** Clamp a number into the inclusive [lo, hi] range. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Derive a 0..1 confidence for an insight from the window's volume + change
 * magnitude: more data points (capped at 10) and a large swing (|change| > 50%)
 * raise confidence above the 0.5 baseline.
 */
function deriveConfidence(stats: WindowStats): number {
  return clamp(0.5 + Math.min(stats.count, 10) / 20 + (Math.abs(stats.changePct) > 50 ? 0.2 : 0), 0, 1);
}

const SYSTEM_PROMPT = [
  'You are a data analyst. In 2-3 sentences, explain what a KPI metric did over the window and why it matters.',
  'Be specific with numbers. No preamble, no markdown headers — just the narrative.',
].join('\n');

/**
 * Generates AI narratives about KPI trends. `generate` summarizes one KPI;
 * `generateBatch` finds the org's most-changed KPIs and summarizes the top N.
 * The daily cron (registered via the controller) fans `generateBatch` across
 * every org under a system context.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly configs: AiConfigsService,
  ) {}

  /** Most-recent values for a KPI, oldest→newest. */
  private async recentValues(organizationId: string, kpiId: string): Promise<number[]> {
    const points = await this.prisma.kPIDataPoint.findMany({
      where: { organizationId, kpiId },
      orderBy: { recordedAt: 'desc' },
      take: POINTS_WINDOW,
      select: { value: true },
    });
    return points.map((p) => p.value).reverse();
  }

  private buildPrompt(name: string, stats: WindowStats): string {
    return [
      `KPI: ${name}`,
      `Points: ${stats.count}, first ${stats.first}, last ${stats.last}, avg ${stats.avg.toFixed(2)}, min ${stats.min}, max ${stats.max}.`,
      `Change first→last: ${stats.changePct.toFixed(1)}%.`,
      'Write the narrative.',
    ].join('\n');
  }

  /** Generate + persist an insight for one KPI. Returns null when too few points. */
  async generate(kpiId: string): Promise<KPIInsight | null> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!kpi) return null;

    const stats = computeWindowStats(await this.recentValues(ctx.organizationId, kpiId));
    if (!stats) return null; // too few points to describe a trend

    const route = await this.configs.resolve('INSIGHTS');
    const result = await this.aiRouter.complete('INSIGHTS', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: this.buildPrompt(kpi.name, stats) }],
      maxTokens: 400,
    });

    return this.prisma.kPIInsight.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        narrative: result.content,
        model: route.model,
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
        confidence: deriveConfidence(stats),
      },
    });
  }

  /** Generate insights for the org's most-changed KPIs (|changePct| ≥ threshold). */
  async generateBatch(input: { thresholdChangePct?: number; topN?: number } = {}): Promise<KPIInsight[]> {
    const ctx = RequestContextStore.require();
    const threshold = input.thresholdChangePct ?? 10;
    const topN = Math.min(50, Math.max(1, input.topN ?? 20));

    const kpis = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });

    const candidates: Array<{ kpiId: string; changePct: number }> = [];
    for (const { id } of kpis) {
      const stats = computeWindowStats(await this.recentValues(ctx.organizationId, id));
      if (stats && Math.abs(stats.changePct) >= threshold) {
        candidates.push({ kpiId: id, changePct: stats.changePct });
      }
    }

    const ranked = rankByAbsChange(candidates, topN);
    const insights: KPIInsight[] = [];
    for (const { kpiId } of ranked) {
      const insight = await this.generate(kpiId);
      if (insight) insights.push(insight);
    }
    return insights;
  }

  async list(filter: { kpiId?: string; from?: Date; to?: Date; includeDismissed?: boolean }): Promise<KPIInsight[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.kPIInsight.findMany({
      where: {
        organizationId: ctx.organizationId,
        // Hide dismissed insights unless the caller explicitly opts in.
        ...(filter.includeDismissed ? {} : { status: { not: 'DISMISSED' } }),
        ...(filter.kpiId ? { kpiId: filter.kpiId } : {}),
        ...(filter.from || filter.to
          ? { generatedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
          : {}),
      },
      orderBy: { generatedAt: 'desc' },
      take: 100,
    });
  }

  /** Mark an insight DISMISSED so it drops out of the default list. Org-scoped. */
  async dismiss(insightId: string): Promise<KPIInsight> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPIInsight.findFirst({
      where: { id: insightId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException({ code: 'INSIGHT_NOT_FOUND', message: 'Insight not found' });

    return this.prisma.kPIInsight.update({
      where: { id: existing.id },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissedById: ctx.userId,
      },
    });
  }

  /** Cron fan-out: run generateBatch for every org that has KPIs. */
  async generateBatchAllOrgs(): Promise<number> {
    const orgs = await RequestContextStore.runWithBypass('insights-daily', () =>
      this.prisma.kPI.findMany({
        where: { deletedAt: null },
        select: { organizationId: true },
        distinct: ['organizationId'],
      }),
    );
    let total = 0;
    for (const { organizationId } of orgs) {
      try {
        const made = await RequestContextStore.run(
          { userId: 'insights-system', organizationId, roleId: null, principalType: 'user', bypassRls: true },
          () => this.generateBatch(),
        );
        total += made.length;
      } catch (err) {
        this.logger.warn(`insights batch failed for org ${organizationId}: ${String(err)}`);
      }
    }
    return total;
  }
}
