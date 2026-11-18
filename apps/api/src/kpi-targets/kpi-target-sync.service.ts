import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

/** How far back the hourly sweep looks for a target that started or ended: a day, so a missed run is made up. */
const SWEEP_LOOKBACK_MS = 25 * 60 * 60 * 1000;

const syncSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  type: true,
  value: true,
  expectedValue: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
} as const;

interface SyncTarget {
  id: string;
  organizationId: string;
  kpiId: string;
  type: string;
  value: number | null;
  expectedValue: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
}

/**
 * The one figure a target gives its KPI, or null when it gives none.
 * A fixed or dated target gives its value; a tiered one its expected value.
 * A scenario is a what-if, and a formula or a condition has no single figure:
 * they are kept on the tab but never become the KPI's target.
 */
export function targetNumber(target: { type: string; value: number | null; expectedValue: number | null }): number | null {
  switch (target.type) {
    case 'STATIC':
    case 'TIME_VARYING':
      return target.value;
    case 'TIERED':
      return target.expectedValue ?? target.value;
    default:
      return null;
  }
}

/**
 * Makes the Targets tab count (UI-017). Health, dashboards, attainment, reports
 * and alerts all read the target on the KPI itself (`KPI.targetValue`), so the
 * target in effect is written there — when a target is added, changed or
 * removed, and by an hourly sweep for one that starts or ends on its own.
 *
 * With no target in effect the KPI keeps the target it has: there is nothing to
 * put in its place, and the figure may have been set on the KPI's own form.
 */
@Injectable()
export class KpiTargetSyncService {
  private readonly logger = new Logger(KpiTargetSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The target that counts at `at`: among those that give a figure and whose
   * window holds the moment, a dated start outranks an open-ended one, a later
   * start an earlier one, and between equals the newest.
   */
  async inEffect(organizationId: string, kpiId: string, at: Date = new Date()): Promise<SyncTarget | null> {
    const rows: SyncTarget[] = await this.prisma.kPITarget.findMany({ where: { organizationId, kpiId }, select: syncSelect });
    const t = at.getTime();
    const live = rows.filter(
      (r) => targetNumber(r) !== null && (r.effectiveFrom === null || r.effectiveFrom.getTime() <= t) && (r.effectiveTo === null || r.effectiveTo.getTime() >= t),
    );
    live.sort((a, b) => {
      const from = (b.effectiveFrom?.getTime() ?? -Infinity) - (a.effectiveFrom?.getTime() ?? -Infinity);
      return from !== 0 && !Number.isNaN(from) ? from : b.createdAt.getTime() - a.createdAt.getTime();
    });
    return live[0] ?? null;
  }

  /** Write the figure of the target in effect to the KPI. Returns it, or null when nothing is in effect. */
  async syncKpi(organizationId: string, kpiId: string, at: Date = new Date()): Promise<number | null> {
    return (await this.apply(organizationId, kpiId, at)).figure;
  }

  private async apply(organizationId: string, kpiId: string, at: Date): Promise<{ figure: number | null; changed: boolean }> {
    const kpi = await this.prisma.kPI.findFirst({ where: { id: kpiId, organizationId }, select: { id: true, targetValue: true } });
    if (!kpi) return { figure: null, changed: false };
    const target = await this.inEffect(organizationId, kpiId, at);
    const figure = target ? targetNumber(target) : null;
    if (target === null || figure === null) return { figure: null, changed: false };
    const changed = kpi.targetValue !== figure;
    if (changed) {
      await this.prisma.kPI.update({ where: { id: kpiId }, data: { targetValue: figure } });
      await this.audit.record({
        action: 'UPDATE',
        entityType: 'KPI',
        entityId: kpiId,
        organizationId,
        metadata: { targetValue: figure, previousTargetValue: kpi.targetValue, fromTargetId: target.id },
      });
    }
    return { figure, changed };
  }

  /**
   * The sweep: every KPI with a target whose start or end passed in the last
   * day is brought up to date. Runs with no request, across organisations, each
   * KPI inside its own. Returns how many KPIs changed.
   */
  async syncDue(now: Date = new Date()): Promise<number> {
    return RequestContextStore.runWithBypass('kpi-target-sync', async () => {
      const since = new Date(now.getTime() - SWEEP_LOOKBACK_MS);
      const due: Array<{ organizationId: string; kpiId: string }> = await this.prisma.kPITarget.findMany({
        where: { OR: [{ effectiveFrom: { gte: since, lte: now } }, { effectiveTo: { gte: since, lte: now } }] },
        select: { organizationId: true, kpiId: true },
      });
      const seen = new Set<string>();
      let changed = 0;
      for (const { organizationId, kpiId } of due) {
        const key = `${organizationId}:${kpiId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          if ((await this.apply(organizationId, kpiId, now)).changed) changed += 1;
        } catch (err) {
          this.logger.warn(`Target sync failed for KPI ${kpiId}: ${String(err)}`);
        }
      }
      return changed;
    });
  }
}
