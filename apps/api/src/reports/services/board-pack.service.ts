import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { KpiDataService } from '../../kpis/kpi-data.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

export interface BoardPackKpiSummary {
  kpiId: string;
  name: string;
  unit: string | null;
  latestValue: number | null;
  change: number | null;
  pointCount: number;
}

export interface BoardPackQuadrant {
  /** Category name — from KPICategory.name or 'All KPIs' if no category set. */
  name: string;
  /** Count of KPIs in each health bucket. */
  health: { ok: number; warning: number; critical: number; unknown: number };
  /** Top 5 KPIs by latest value (desc), or all if fewer than 5. */
  topKpis: Array<{ kpiId: string; name: string; latestValue: number | null }>;
}

export interface BoardPackResult {
  org: { name: string };
  period: { sinceDays: number; from: Date; to: Date };
  /** Top 6 KPIs by largest absolute change (desc). */
  topMovers: BoardPackKpiSummary[];
  quadrants: BoardPackQuadrant[];
}

@Injectable()
export class BoardPackService {
  constructor(
    private readonly kpiData: KpiDataService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Compose a board-pack JSON result.
   * Uses KpiDataService.dashboardSummary for all visible KPIs in the window,
   * then adds category grouping and top-movers ranking.
   */
  async compose({ sinceDays }: { sinceDays: number }): Promise<BoardPackResult> {
    const ctx = RequestContextStore.require();

    const to = new Date();
    const from = new Date(to.getTime() - sinceDays * 24 * 60 * 60 * 1000);

    // Org name for the report header.
    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'Unknown Org';

    // dashboardSummary returns one row per visible KPI with latestValue + aggregatedValue.
    const summary = await this.kpiData.dashboardSummary({ from, to });

    if (summary.length === 0) {
      return {
        org: { name: orgName },
        period: { sinceDays, from, to },
        topMovers: [],
        quadrants: [],
      };
    }

    // Build the KPI summary list with change.
    // `aggregatedValue` is computed over the window — we approximate change as
    // (latestValue - aggregatedValue) which gives meaningful signal when
    // aggregationMethod is LAST / FIRST (the most common case).
    // For SUM/AVG methods this is less meaningful but still sortable.
    const kpiSummaries: BoardPackKpiSummary[] = summary.map((row) => {
      const change =
        row.latestValue !== null && row.aggregatedValue !== null
          ? row.latestValue - row.aggregatedValue
          : null;
      return {
        kpiId: row.kpiId,
        name: row.name,
        unit: row.unit,
        latestValue: row.latestValue,
        change,
        pointCount: row.pointCount,
      };
    });

    // Top 6 movers by |change| descending.
    const topMovers = [...kpiSummaries]
      .filter((k) => k.change !== null)
      .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
      .slice(0, 6);

    // ── Quadrants (category grouping) ─────────────────────────────────────────
    // Fetch category info for all visible KPIs.
    const kpiIds = summary.map((r) => r.kpiId);
    const kpiRows = await this.prisma.kPI.findMany({
      where: { id: { in: kpiIds }, organizationId: ctx.organizationId, deletedAt: null },
      select: {
        id: true,
        warningThreshold: true,
        criticalThreshold: true,
        direction: true,
        targetValue: true,
        category: { select: { name: true } },
      },
    });

    // Build a lookup: kpiId → { category name, thresholds }
    const kpiMeta = new Map(
      kpiRows.map((k) => [
        k.id,
        {
          category: k.category?.name ?? null,
          warningThreshold: k.warningThreshold,
          criticalThreshold: k.criticalThreshold,
          direction: k.direction,
          targetValue: k.targetValue,
        },
      ]),
    );

    // Group by category name.
    const groups = new Map<string, BoardPackKpiSummary[]>();
    for (const ks of kpiSummaries) {
      const meta = kpiMeta.get(ks.kpiId);
      const groupName = meta?.category ?? 'Uncategorized';
      const arr = groups.get(groupName) ?? [];
      arr.push(ks);
      groups.set(groupName, arr);
    }

    const quadrants: BoardPackQuadrant[] = Array.from(groups.entries()).map(
      ([groupName, groupKpis]) => {
        const health = { ok: 0, warning: 0, critical: 0, unknown: 0 };
        for (const ks of groupKpis) {
          const meta = kpiMeta.get(ks.kpiId);
          const status = computeSimpleStatus(
            ks.latestValue,
            meta?.targetValue ?? null,
            meta?.warningThreshold ?? null,
            meta?.criticalThreshold ?? null,
            meta?.direction ?? 'NEUTRAL',
          );
          health[status]++;
        }

        const topKpis = [...groupKpis]
          .sort((a, b) => (b.latestValue ?? -Infinity) - (a.latestValue ?? -Infinity))
          .slice(0, 5)
          .map((ks) => ({ kpiId: ks.kpiId, name: ks.name, latestValue: ks.latestValue }));

        return { name: groupName, health, topKpis };
      },
    );

    return {
      org: { name: orgName },
      period: { sinceDays, from, to },
      topMovers,
      quadrants,
    };
  }
}

function computeSimpleStatus(
  latestValue: number | null,
  targetValue: number | null,
  warningThreshold: number | null,
  criticalThreshold: number | null,
  direction: string,
): 'ok' | 'warning' | 'critical' | 'unknown' {
  if (latestValue === null) return 'unknown';
  if (criticalThreshold === null && warningThreshold === null) return 'unknown';

  if (direction === 'HIGHER_IS_BETTER') {
    if (criticalThreshold !== null && latestValue <= criticalThreshold) return 'critical';
    if (warningThreshold !== null && latestValue <= warningThreshold) return 'warning';
    return 'ok';
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (criticalThreshold !== null && latestValue >= criticalThreshold) return 'critical';
    if (warningThreshold !== null && latestValue >= warningThreshold) return 'warning';
    return 'ok';
  }

  // TARGET_IS_BEST / NEUTRAL
  if (targetValue !== null) {
    const deviation = Math.abs(latestValue - targetValue) / (Math.abs(targetValue) || 1);
    if (criticalThreshold !== null && deviation >= criticalThreshold) return 'critical';
    if (warningThreshold !== null && deviation >= warningThreshold) return 'warning';
    return 'ok';
  }

  return 'unknown';
}
