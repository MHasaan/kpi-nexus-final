import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { evaluateFormula } from '../formula/formula.js';

export type RollupMethod = 'SUM' | 'AVG' | 'WEIGHTED_AVG' | 'MIN' | 'MAX' | 'CUSTOM_FORMULA';

export interface RollupResult {
  parentKpiId: string;
  periodStart: Date;
  periodEnd: Date;
  /** Aggregated value, or null if no children had any data in the period. */
  value: number | null;
  /** Number of child KPIs that contributed at least one data point. */
  contributingChildren: number;
  /** Total number of child data points consumed. */
  totalDataPoints: number;
}

/**
 * Pure aggregation helpers — exported for unit testing without the DB.
 * The CascadeService consumes them after fetching child data from Prisma.
 */
export function applyRollup(
  method: RollupMethod,
  /** Map of childKpiName → numeric value already aggregated for this period. */
  childValues: Record<string, number>,
  /** Optional weights — keyed by childKpiName. Missing weights default to 1. */
  weights: Record<string, number> = {},
  /** Only used when method === 'CUSTOM_FORMULA'. */
  customFormula?: string,
): number | null {
  const entries = Object.entries(childValues);
  if (entries.length === 0) return null;

  switch (method) {
    case 'SUM':
      return entries.reduce((acc, [, v]) => acc + v, 0);

    case 'AVG':
      return entries.reduce((acc, [, v]) => acc + v, 0) / entries.length;

    case 'WEIGHTED_AVG': {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const [name, v] of entries) {
        const w = weights[name] ?? 1;
        weightedSum += v * w;
        totalWeight += w;
      }
      if (totalWeight === 0) return null;
      return weightedSum / totalWeight;
    }

    case 'MIN':
      return entries.reduce<number>(
        (acc, [, v]) => Math.min(acc, v),
        Number.POSITIVE_INFINITY,
      );

    case 'MAX':
      return entries.reduce<number>(
        (acc, [, v]) => Math.max(acc, v),
        Number.NEGATIVE_INFINITY,
      );

    case 'CUSTOM_FORMULA': {
      if (!customFormula) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'CUSTOM_FORMULA cascade requires customFormula',
        });
      }
      const result = evaluateFormula(customFormula, childValues);
      if (typeof result === 'boolean') {
        return result ? 1 : 0;
      }
      return result;
    }
  }
}

/**
 * Per-child period-aggregate: sum (or average, depending on the KPI's
 * aggregationMethod) all data points where periodStart falls within
 * [windowStart, windowEnd]. Used to collapse a period's worth of
 * data points into a single number before applying the cascade rollup.
 */
export function aggregateChildPoints(
  points: Array<{ value: number; periodStart: Date }>,
  childAggregation: 'SUM' | 'AVG' | 'LAST' | 'FIRST',
  windowStart: Date,
  windowEnd: Date,
): number | null {
  const inWindow = points.filter(
    (p) => p.periodStart >= windowStart && p.periodStart <= windowEnd,
  );
  if (inWindow.length === 0) return null;

  switch (childAggregation) {
    case 'SUM':
      return inWindow.reduce((a, p) => a + p.value, 0);
    case 'AVG':
      return inWindow.reduce((a, p) => a + p.value, 0) / inWindow.length;
    case 'LAST': {
      const sorted = [...inWindow].sort(
        (a, b) => b.periodStart.getTime() - a.periodStart.getTime(),
      );
      return sorted[0]!.value;
    }
    case 'FIRST': {
      const sorted = [...inWindow].sort(
        (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
      );
      return sorted[0]!.value;
    }
  }
}

@Injectable()
export class CascadeService {
  private readonly logger = new Logger(CascadeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute the cascade rollup for a parent KPI over the given period.
   * Fetches the cascade edges, pulls each child's data points in the period,
   * collapses each child to one number (via the child's aggregationMethod),
   * then applies the rollup method.
   */
  async computeForParent(
    parentKpiId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<RollupResult> {
    const ctx = RequestContextStore.require();

    const edges = await this.prisma.kPICascade.findMany({
      where: { parentKpiId, organizationId: ctx.organizationId },
      include: {
        childKpi: {
          select: { id: true, name: true, aggregationMethod: true },
        },
      },
    });

    if (edges.length === 0) {
      return {
        parentKpiId,
        periodStart,
        periodEnd,
        value: null,
        contributingChildren: 0,
        totalDataPoints: 0,
      };
    }

    const childValues: Record<string, number> = {};
    const weights: Record<string, number> = {};
    let totalDataPoints = 0;
    // Method must be consistent across the parent's edges — take the first
    // (in practice every edge of a given parent has the same method, but the
    // schema allows variance; we collapse to the first).
    const method = edges[0]!.method as RollupMethod;
    const customFormula = edges[0]?.customFormula ?? undefined;

    for (const edge of edges) {
      const points = await this.prisma.kPIDataPoint.findMany({
        where: {
          organizationId: ctx.organizationId,
          kpiId: edge.childKpi.id,
          periodStart: { gte: periodStart, lte: periodEnd },
        },
        select: { value: true, periodStart: true },
      });
      const childAgg = collapseAggregation(edge.childKpi.aggregationMethod);
      const collapsed = aggregateChildPoints(
        points,
        childAgg,
        periodStart,
        periodEnd,
      );
      if (collapsed !== null) {
        childValues[edge.childKpi.name] = collapsed;
        weights[edge.childKpi.name] = edge.weight;
        totalDataPoints += points.length;
      }
    }

    const value = applyRollup(method, childValues, weights, customFormula);

    // Record the recompute timestamp on the edges
    await this.prisma.kPICascade.updateMany({
      where: { parentKpiId, organizationId: ctx.organizationId },
      data: { lastComputedAt: new Date() },
    });

    return {
      parentKpiId,
      periodStart,
      periodEnd,
      value,
      contributingChildren: Object.keys(childValues).length,
      totalDataPoints,
    };
  }
}

/** Collapse the full AggregationMethod enum to the 4 the cascade understands. */
function collapseAggregation(
  am: string,
): 'SUM' | 'AVG' | 'LAST' | 'FIRST' {
  switch (am) {
    case 'SUM':
    case 'COUNT':
    case 'COUNT_DISTINCT':
      return 'SUM';
    case 'AVG':
    case 'MEDIAN':
    case 'P25':
    case 'P75':
    case 'P90':
    case 'P95':
    case 'P99':
    case 'STDEV':
      return 'AVG';
    case 'FIRST':
      return 'FIRST';
    case 'MIN':
    case 'MAX':
    case 'LAST':
    default:
      return 'LAST';
  }
}
