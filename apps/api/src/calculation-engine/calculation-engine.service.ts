import { Injectable, Logger } from '@nestjs/common';

import { CascadeService } from '../kpis/cascade.service.js';
import { LineageService } from '../lineage/lineage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { evaluateFormula } from '../formula/formula.js';

export interface RecomputeResult {
  /** Computed value, or null when a referenced source has no data yet. */
  value: number | null;
  /** Formula KPIs that depend on this one (for transitive recompute). */
  dependents: string[];
}

export interface RollupResultSummary {
  value: number | null;
  /** Parents that this KPI rolls up into (for transitive rollup). */
  parents: string[];
}

/**
 * The testable core of the calc engine, shared by the BullMQ processor and the
 * synchronous trigger endpoints. All COMPUTED data points are written directly
 * via Prisma (never through DataPointsService) so they never re-enter the
 * insert -> enqueue path. Org scoping is explicit via RequestContextStore.
 */
@Injectable()
export class CalculationEngineService {
  private readonly logger = new Logger(CalculationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cascade: CascadeService,
    private readonly lineage: LineageService,
  ) {}

  /**
   * Re-evaluate a formula KPI from its dependency sources' latest values and
   * write a COMPUTED data point. Returns value=null (no write) when the KPI has
   * no formula or a referenced source has no data yet.
   */
  async recomputeKpi(kpiId: string): Promise<RecomputeResult> {
    const ctx = RequestContextStore.require();
    const dependents = await this.dependentsOf(kpiId);

    const expr = await this.prisma.formulaExpression.findFirst({
      where: { kpiId, organizationId: ctx.organizationId },
      select: { raw: true },
    });
    if (!expr) return { value: null, dependents };

    const deps = await this.prisma.kPIDependency.findMany({
      where: { organizationId: ctx.organizationId, dependentKpiId: kpiId },
      select: { sourceKpiId: true, formulaRef: true },
    });

    // Build identifier -> latest value, keyed by the identifier as written.
    const values: Record<string, number> = {};
    for (const d of deps) {
      const ref = d.formulaRef ?? d.sourceKpiId;
      const latest = await this.prisma.kPIDataPoint.findFirst({
        where: { kpiId: d.sourceKpiId, organizationId: ctx.organizationId },
        select: { value: true },
        orderBy: { recordedAt: 'desc' },
      });
      if (!latest) {
        this.logger.warn(`recompute ${kpiId}: source ${ref} has no data; skipping`);
        return { value: null, dependents };
      }
      values[ref] = latest.value;
    }

    let value: number;
    try {
      const result = evaluateFormula(expr.raw, values);
      value = typeof result === 'boolean' ? (result ? 1 : 0) : result;
    } catch (err) {
      this.logger.warn(`recompute ${kpiId}: eval failed: ${String(err)}`);
      return { value: null, dependents };
    }

    const now = new Date();
    await this.prisma.kPIDataPoint.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        value,
        periodStart: now,
        periodEnd: now,
        sourceType: 'COMPUTED',
      },
    });
    for (const d of deps) {
      await this.lineage.record({
        sourceType: 'kpi',
        sourceId: d.sourceKpiId,
        targetType: 'kpi',
        targetId: kpiId,
        transformType: 'FORMULA',
      });
    }
    return { value, dependents };
  }

  /**
   * Roll a parent KPI up from its children over a period and write a COMPUTED
   * data point. Returns value=null (no write) when no child has data in the
   * period.
   */
  async rollupParent(parentKpiId: string, periodStart: Date, periodEnd: Date): Promise<RollupResultSummary> {
    const ctx = RequestContextStore.require();
    const parents = await this.parentsOf(parentKpiId);

    const result = await this.cascade.computeForParent(parentKpiId, periodStart, periodEnd);
    if (result.value === null) return { value: null, parents };

    await this.prisma.kPIDataPoint.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId: parentKpiId,
        value: result.value,
        periodStart,
        periodEnd,
        sourceType: 'COMPUTED',
      },
    });

    const children = await this.prisma.kPICascade.findMany({
      where: { parentKpiId, organizationId: ctx.organizationId },
      select: { childKpiId: true },
    });
    for (const c of children) {
      await this.lineage.record({
        sourceType: 'kpi',
        sourceId: c.childKpiId,
        targetType: 'kpi',
        targetId: parentKpiId,
        transformType: 'CASCADE_ROLLUP',
      });
    }
    return { value: result.value, parents };
  }

  /** Formula KPIs whose formulas reference `kpiId` (its dependents). */
  private async dependentsOf(kpiId: string): Promise<string[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPIDependency.findMany({
      where: { organizationId: ctx.organizationId, sourceKpiId: kpiId },
      select: { dependentKpiId: true },
    });
    return rows.map((r) => r.dependentKpiId);
  }

  /** Parent KPIs that `kpiId` rolls up into. */
  private async parentsOf(kpiId: string): Promise<string[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPICascade.findMany({
      where: { organizationId: ctx.organizationId, childKpiId: kpiId },
      select: { parentKpiId: true },
    });
    return rows.map((r) => r.parentKpiId);
  }
}
