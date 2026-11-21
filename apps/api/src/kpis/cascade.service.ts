import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { evaluateFormula } from '../formula/formula.js';

export type RollupMethod = 'SUM' | 'AVG' | 'WEIGHTED_AVG' | 'MIN' | 'MAX' | 'CUSTOM_FORMULA';

/** A child's data point with whose it is: a unit's, a person's, or the organisation's (both null). */
export interface HolderPoint {
  value: number;
  periodStart: Date;
  orgUnitId: string | null;
  userId: string | null;
}

/** How a child's holders (its units or people) are combined into the child's one value for a period. */
export type HolderCombine = 'SUM' | 'AVG' | 'MIN' | 'MAX';

/** KPI types whose values add up across holders; the others (percentages, ratings, durations) are levels. */
const ADDITIVE_KPI_TYPES: ReadonlySet<string> = new Set(['NUMBER', 'COUNT', 'CURRENCY']);

/**
 * How to combine a child's holders, given the parent's roll-up method. A sum, average, minimum or maximum
 * across children applies across each child's holders too ("the sum of them" sums every team's bookings).
 * A weighted average or a formula needs one value per child: amounts add up, levels are averaged.
 */
export function combineForMethod(method: RollupMethod, childKpiType: string): HolderCombine {
  if (method === 'SUM' || method === 'AVG' || method === 'MIN' || method === 'MAX') return method;
  return ADDITIVE_KPI_TYPES.has(childKpiType) ? 'SUM' : 'AVG';
}

const holderKey = (p: HolderPoint): string => `${p.orgUnitId ?? ''}|${p.userId ?? ''}`;

/**
 * One value for a child KPI over a period. The child's own organisation-level points stand for it when it
 * has any (a child that is itself a parent has calculated ones). Otherwise each holder's points are
 * collapsed by the child's aggregation and the holders combined with `combine`. Until 2026-11-21 all
 * holders' points were collapsed together, so one unit's value stood for a child recorded by several.
 */
export function childPeriodValue(
  points: HolderPoint[],
  childAggregation: 'SUM' | 'AVG' | 'LAST' | 'FIRST',
  windowStart: Date,
  windowEnd: Date,
  combine: HolderCombine,
): number | null {
  const inWindow = points.filter((p) => p.periodStart >= windowStart && p.periodStart <= windowEnd);
  const orgLevel = inWindow.filter((p) => p.orgUnitId === null && p.userId === null);
  if (orgLevel.length > 0) return aggregateChildPoints(orgLevel, childAggregation, windowStart, windowEnd);

  const byHolder = new Map<string, HolderPoint[]>();
  for (const p of inWindow) byHolder.set(holderKey(p), [...(byHolder.get(holderKey(p)) ?? []), p]);
  const values = [...byHolder.values()]
    .map((own) => aggregateChildPoints(own, childAggregation, windowStart, windowEnd))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  switch (combine) {
    case 'SUM':
      return values.reduce((a, v) => a + v, 0);
    case 'AVG':
      return values.reduce((a, v) => a + v, 0) / values.length;
    case 'MIN':
      return Math.min(...values);
    case 'MAX':
      return Math.max(...values);
  }
}

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
          select: { id: true, name: true, aggregationMethod: true, type: true },
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
        select: { value: true, periodStart: true, orgUnitId: true, userId: true },
      });
      const childAgg = collapseAggregation(edge.childKpi.aggregationMethod);
      // A child recorded per unit or per person counts each holder's value (F-028).
      const collapsed = childPeriodValue(points, childAgg, periodStart, periodEnd, combineForMethod(method, edge.childKpi.type));
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

  /** The KPI's calculated organisation-level point for a period, if it has one. */
  private computedPointFor(kpiId: string, organizationId: string, periodStart: Date) {
    return this.prisma.kPIDataPoint.findFirst({
      where: { organizationId, kpiId, sourceType: 'COMPUTED', periodStart, orgUnitId: null, userId: null },
      select: { id: true, recordedAt: true },
    });
  }

  /**
   * Write a KPI's calculated value for a period: one organisation-level COMPUTED row per period, replaced
   * on each recompute. Until 2026-11-21 every recompute added another row, so a parent's history filled
   * with duplicates that could be neither corrected nor removed (F-028). Recorded values are left alone.
   */
  async writeComputedPoint(kpiId: string, periodStart: Date, periodEnd: Date, value: number): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.computedPointFor(kpiId, ctx.organizationId, periodStart);
    if (existing) {
      await this.prisma.kPIDataPoint.update({
        where: { recordedAt_id: { recordedAt: existing.recordedAt, id: existing.id } },
        data: { value, periodEnd },
      });
      return;
    }
    await this.prisma.kPIDataPoint.create({
      data: { organizationId: ctx.organizationId, kpiId, value, periodStart, periodEnd, sourceType: 'COMPUTED' },
    });
  }

  /** Remove every calculated organisation-level row of a KPI. Returns how many. */
  async removeComputedPoints(kpiId: string): Promise<number> {
    const ctx = RequestContextStore.require();
    const { count } = await this.prisma.kPIDataPoint.deleteMany({
      where: { organizationId: ctx.organizationId, kpiId, sourceType: 'COMPUTED', orgUnitId: null, userId: null },
    });
    return count;
  }

  /**
   * After a parent's children changed (a detach): with children left, its newest calculated period is
   * worked out again from them; with none left, its calculated rows are removed, unless a formula owns
   * them. Until 2026-11-21 a detach left the rows as they were.
   */
  async refreshParent(parentKpiId: string): Promise<'recomputed' | 'removed' | 'none'> {
    const ctx = RequestContextStore.require();
    const children = await this.prisma.kPICascade.count({ where: { parentKpiId, organizationId: ctx.organizationId } });
    if (children === 0) {
      const formula = await this.prisma.formulaExpression.findFirst({
        where: { kpiId: parentKpiId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (formula) return 'none';
      return (await this.removeComputedPoints(parentKpiId)) > 0 ? 'removed' : 'none';
    }
    const newest = await this.prisma.kPIDataPoint.findFirst({
      where: { organizationId: ctx.organizationId, kpiId: parentKpiId, sourceType: 'COMPUTED', orgUnitId: null, userId: null },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true, periodEnd: true },
    });
    if (!newest) return 'none';
    const result = await this.computeForParent(parentKpiId, newest.periodStart, newest.periodEnd);
    if (result.value === null) {
      await this.removeComputedPoints(parentKpiId);
      return 'removed';
    }
    await this.writeComputedPoint(parentKpiId, newest.periodStart, newest.periodEnd, result.value);
    return 'recomputed';
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
