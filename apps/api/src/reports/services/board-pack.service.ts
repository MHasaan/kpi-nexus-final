import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { KpiDataService } from '../../kpis/kpi-data.service.js';
import type { KpiHealthStatus } from '../../kpis/kpi-health.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

/** Board-level health of one KPI — the shared server rule (kpis/kpi-health.ts). */
export type BoardPackStatus = KpiHealthStatus;

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
    const kpiRows = await this.prisma.kPI.findMany({
      where: { id: { in: current.map((r) => r.kpiId) }, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, category: { select: { name: true } } },
    });
    const categoryById = new Map(kpiRows.map((k) => [k.id, k.category?.name ?? null]));

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
      // Same server-computed status the dashboard shows (bands → thresholds → target).
      const group = categoryById.get(r.kpiId) ?? 'Uncategorized';
      groups.set(group, [
        ...(groups.get(group) ?? []),
        { kpiId: r.kpiId, name: r.name, unit: r.unit, value: r.latestValue, status: r.status },
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
