import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { KpiDataService } from '../../kpis/kpi-data.service.js';
import { resolveStatus } from '../../kpi-threshold-bands/threshold-resolver.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { type KpiDirection, computeAssignmentStatus } from '../../user-kpis/assignment-status.js';

/** Board-level health of one KPI. Rendered by the web board-pack page. */
export type BoardPackStatus = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_TARGET' | 'NO_DATA';

export interface BoardPackMover {
  kpiId: string;
  name: string;
  unit: string | null;
  previousValue: number | null;
  currentValue: number | null;
  change: number | null;
  changePct: number | null;
}

export interface BoardPackQuadrantKpi {
  kpiId: string;
  name: string;
  unit: string | null;
  value: number | null;
  status: BoardPackStatus;
}

export interface BoardPackQuadrant {
  /** KPI category name ('Uncategorized' when none). */
  name: string;
  /** Problems first (OFF_TRACK, AT_RISK), then ON_TRACK, then no target/data. */
  kpis: BoardPackQuadrantKpi[];
  /** Count of KPIs per status (only statuses that occur). */
  healthDistribution: Partial<Record<BoardPackStatus, number>>;
}

/**
 * Shape consumed by apps/web/src/lib/api-client.ts (BoardPack). It drifted
 * from the web contract (topKpis/latestValue/health) and crashed the page
 * (BE-027 / FE-012).
 */
export interface BoardPackResult {
  org: { id: string; name: string };
  period: { sinceDays: number; from: Date; to: Date };
  /** Up to 6 KPIs with the largest |% change| over the period. */
  topMovers: BoardPackMover[];
  quadrants: BoardPackQuadrant[];
}

const STATUS_ORDER: BoardPackStatus[] = ['OFF_TRACK', 'AT_RISK', 'ON_TRACK', 'NO_TARGET', 'NO_DATA'];

@Injectable()
export class BoardPackService {
  constructor(
    private readonly kpiData: KpiDataService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Compose the board pack for the last `sinceDays`.
   *
   * "Current" is each KPI's latest value whose period ended by now; "previous"
   * is the latest whose period ended by the window start. Both come from
   * dashboardSummary, so visibility + data limits apply exactly as on the
   * dashboard. (Asking dashboardSummary for points *inside* the window — what
   * this used to do — requires a period to fit entirely in it, so a monthly
   * KPI never showed in a 30-day pack: every value was null — BE-027.)
   */
  async compose({ sinceDays }: { sinceDays: number }): Promise<BoardPackResult> {
    const ctx = RequestContextStore.require();
    const to = new Date();
    const from = new Date(to.getTime() - sinceDays * 24 * 60 * 60 * 1000);

    const [org, current, previous] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { id: true, name: true } }),
      this.kpiData.dashboardSummary({ to }),
      this.kpiData.dashboardSummary({ to: from }),
    ]);
    const result: BoardPackResult = {
      org: { id: ctx.organizationId, name: org?.name ?? 'Unknown Org' },
      period: { sinceDays, from, to },
      topMovers: [],
      quadrants: [],
    };
    if (current.length === 0) return result;

    const previousById = new Map(previous.map((r) => [r.kpiId, r.latestValue]));
    const kpiIds = current.map((r) => r.kpiId);
    const [kpiRows, bandRows] = await Promise.all([
      this.prisma.kPI.findMany({
        where: { id: { in: kpiIds }, organizationId: ctx.organizationId, deletedAt: null },
        select: {
          id: true,
          direction: true,
          targetValue: true,
          warningThreshold: true,
          criticalThreshold: true,
          category: { select: { name: true } },
        },
      }),
      this.prisma.kPIThresholdBand.findMany({
        where: { kpiId: { in: kpiIds }, organizationId: ctx.organizationId },
        select: { kpiId: true, name: true, lower: true, upper: true, color: true, order: true, consecutivePointsRequired: true },
      }),
    ]);
    const metaById = new Map(kpiRows.map((k) => [k.id, k]));
    const bandsByKpi = new Map<string, typeof bandRows>();
    for (const b of bandRows) bandsByKpi.set(b.kpiId, [...(bandsByKpi.get(b.kpiId) ?? []), b]);

    // ── Top movers ──────────────────────────────────────────────────────────
    result.topMovers = current
      .map((r): BoardPackMover => {
        const prev = previousById.get(r.kpiId) ?? null;
        const change = r.latestValue !== null && prev !== null ? r.latestValue - prev : null;
        return {
          kpiId: r.kpiId,
          name: r.name,
          unit: r.unit,
          previousValue: prev,
          currentValue: r.latestValue,
          change,
          changePct: change !== null && prev !== null && prev !== 0 ? (change / Math.abs(prev)) * 100 : null,
        };
      })
      // % change is comparable across units (USD vs %); absolute change is not.
      .filter((m) => m.changePct !== null && m.changePct !== 0)
      .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
      .slice(0, 6);

    // ── Quadrants (by category) ─────────────────────────────────────────────
    const groups = new Map<string, BoardPackQuadrantKpi[]>();
    for (const r of current) {
      const meta = metaById.get(r.kpiId);
      const status = kpiStatus(
        r.latestValue,
        previousById.get(r.kpiId) ?? null,
        meta ?? null,
        bandsByKpi.get(r.kpiId) ?? [],
      );
      const group = meta?.category?.name ?? 'Uncategorized';
      groups.set(group, [
        ...(groups.get(group) ?? []),
        { kpiId: r.kpiId, name: r.name, unit: r.unit, value: r.latestValue, status },
      ]);
    }
    result.quadrants = Array.from(groups.entries()).map(([name, kpis]) => {
      const healthDistribution: Partial<Record<BoardPackStatus, number>> = {};
      for (const s of STATUS_ORDER) {
        const n = kpis.filter((k) => k.status === s).length;
        if (n > 0) healthDistribution[s] = n;
      }
      return {
        name,
        kpis: [...kpis].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)),
        healthDistribution,
      };
    });

    return result;
  }
}

/**
 * Board status for one KPI, most specific rule first: configured threshold
 * bands → explicit warning/critical thresholds → direction-aware target
 * (same grading as KPI assignments) → no target.
 */
function kpiStatus(
  value: number | null,
  previous: number | null,
  meta: {
    direction: string;
    targetValue: number | null;
    warningThreshold: number | null;
    criticalThreshold: number | null;
  } | null,
  bands: Array<{ name: string; lower: number | null; upper: number | null; color: string; order: number; consecutivePointsRequired: number }>,
): BoardPackStatus {
  if (value === null) return 'NO_DATA';

  if (bands.length > 0) {
    const recent = previous === null ? [value] : [value, previous];
    const resolved = resolveStatus(bands, recent);
    if (resolved.band) return statusFromBandName(resolved.band);
  }

  if (meta && (meta.warningThreshold !== null || meta.criticalThreshold !== null)) {
    const t = thresholdStatus(value, meta.warningThreshold, meta.criticalThreshold, meta.direction, meta.targetValue);
    if (t) return t;
  }

  const graded = meta ? computeAssignmentStatus(value, meta.targetValue, meta.direction as KpiDirection) : null;
  if (graded === 'exceeded' || graded === 'on_track') return 'ON_TRACK';
  if (graded === 'at_risk') return 'AT_RISK';
  if (graded === 'behind') return 'OFF_TRACK';
  return 'NO_TARGET';
}

/** Map a threshold-band name ("On Track", "At Risk", "Off Track", "Critical", …) to a status. */
function statusFromBandName(name: string): BoardPackStatus {
  const n = name.toLowerCase();
  if (/off|crit|red|behind|fail/.test(n)) return 'OFF_TRACK';
  if (/risk|warn|amber|watch/.test(n)) return 'AT_RISK';
  return 'ON_TRACK';
}

/** Legacy KPI.warningThreshold / criticalThreshold, direction-aware. */
function thresholdStatus(
  value: number,
  warning: number | null,
  critical: number | null,
  direction: string,
  target: number | null,
): BoardPackStatus | null {
  if (direction === 'HIGHER_IS_BETTER') {
    if (critical !== null && value <= critical) return 'OFF_TRACK';
    if (warning !== null && value <= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  if (direction === 'LOWER_IS_BETTER') {
    if (critical !== null && value >= critical) return 'OFF_TRACK';
    if (warning !== null && value >= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  if (target !== null) {
    const deviation = Math.abs(value - target) / (Math.abs(target) || 1);
    if (critical !== null && deviation >= critical) return 'OFF_TRACK';
    if (warning !== null && deviation >= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  return null;
}
