import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { KPIDirection, KPIInsight } from '@kpi-nexus/db';

import { AiConfigsService } from '../ai/ai-configs.service.js';
import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type WindowStats, computeWindowStats, rankByAbsChange } from './insight-stats.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';

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
  'Be specific with numbers. When a target is given, say how the latest value compares to it (e.g. "12% below its target of Y"). No preamble, no markdown headers — just the narrative.',
].join('\n');

/** Fields pulled from the KPI to ground the insight narrative. */
interface KpiGrounding {
  id: string;
  name: string;
  unit: string | null;
  direction: KPIDirection;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

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
    private readonly accessContext: AccessContextService,
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

  private buildPrompt(kpi: KpiGrounding, stats: WindowStats): string {
    const header = `KPI: ${kpi.name}${kpi.unit ? ` (${kpi.unit})` : ''} (direction: ${kpi.direction})`;
    const lines: string[] = [
      header,
      `Points: ${stats.count}, first ${stats.first}, last ${stats.last}, avg ${stats.avg.toFixed(2)}, min ${stats.min}, max ${stats.max}.`,
      `Change first→last: ${stats.changePct.toFixed(1)}%.`,
    ];

    // Target + on/off-target status of the latest value (computed via direction).
    if (kpi.targetValue != null) {
      const status = targetStatus(stats.last, kpi.targetValue, kpi.direction);
      lines.push(`Target: ${formatNum(kpi.targetValue)}${status ? ` (latest is ${status})` : ''}.`);
    }

    // Thresholds (only those that are set).
    const th: string[] = [];
    if (kpi.warningThreshold != null) th.push(`warning ${formatNum(kpi.warningThreshold)}`);
    if (kpi.criticalThreshold != null) th.push(`critical ${formatNum(kpi.criticalThreshold)}`);
    if (th.length > 0) lines.push(`Thresholds: ${th.join(', ')}.`);

    lines.push('Write the narrative.');
    return lines.join('\n');
  }

  /** Generate + persist an insight for one KPI. Returns null when too few points. */
  async generate(kpiId: string): Promise<KPIInsight | null> {
    const ctx = RequestContextStore.require();
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
    if (!kpi) return null;

    const stats = computeWindowStats(await this.recentValues(ctx.organizationId, kpiId));
    if (!stats) return null; // too few points to describe a trend

    const route = await this.configs.resolve('INSIGHTS');
    const result = await this.aiRouter.complete('INSIGHTS', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: this.buildPrompt(kpi, stats) }],
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
    // Only insights about KPIs the caller can see (BE-004) — null = admin, no filter.
    const visible = await this.accessContext.visibleKpiIds();
    if (filter.kpiId && visible && !visible.includes(filter.kpiId)) return [];
    return this.prisma.kPIInsight.findMany({
      where: {
        organizationId: ctx.organizationId,
        // Hide dismissed insights unless the caller explicitly opts in.
        ...(filter.includeDismissed ? {} : { status: { not: 'DISMISSED' } }),
        ...(filter.kpiId ? { kpiId: filter.kpiId } : visible ? { kpiId: { in: visible } } : {}),
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
      select: { id: true, kpiId: true },
    });
    // An insight about a KPI you can't see doesn't exist for you (BE-004).
    if (!existing || !(await this.accessContext.isKpiVisible(existing.kpiId))) {
      throw new NotFoundException({ code: 'INSIGHT_NOT_FOUND', message: 'Insight not found' });
    }

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
