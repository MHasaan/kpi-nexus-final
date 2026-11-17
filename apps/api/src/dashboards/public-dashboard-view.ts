import type { KpiHealthStatus } from '../kpis/kpi-health.js';

/**
 * What a public share link may show beyond a bare latest value, and the pure
 * rules for shaping it. Everything here is read by people with no account, so
 * the shapes carry only what a widget draws: no ids of people, no categories,
 * no rows a widget would not display.
 */

/** A KPI a widget on the shared dashboard points at. */
export interface PublicKpiView {
  name: string;
  unit: string | null;
  direction: string;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  /** Null when the KPI is not organisation-wide: per-unit and per-person values are never public. */
  status: KpiHealthStatus | null;
  /** Oldest first. Empty for a KPI that is not organisation-wide. */
  series: Array<{ periodStart: Date; recordedAt: Date; value: number }>;
}

/** One line of a list widget. */
export interface PublicListRow {
  kpiId: string;
  name: string;
  unit: string | null;
  latestValue: number | null;
  status: KpiHealthStatus;
  attainmentPct: number | null;
}

export const PERSPECTIVES = ['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH'] as const;

/** A strategy-map tile: counts only, no KPI names. */
export interface PublicPerspectiveCount {
  perspective: (typeof PERSPECTIVES)[number];
  total: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
}

export interface SummaryRow extends PublicListRow {
  scorecardQuadrant: string | null;
}

/** How many points of history a shared chart gets. */
export const PUBLIC_SERIES_POINTS = 60;
const DEFAULT_LIST_ITEMS = 10;
const MAX_LIST_ITEMS = 50;

/**
 * How many rows the list widgets on a dashboard display between them — the
 * largest `maxItems`, capped. Null when there is no list widget, so no rows
 * are sent at all.
 */
export function publicListSize(widgets: ReadonlyArray<{ widgetType: string; config: unknown }>): number | null {
  const lists = widgets.filter((w) => w.widgetType === 'list');
  if (lists.length === 0) return null;
  const sizes = lists.map((w) => {
    const configured = (w.config as { maxItems?: unknown } | null)?.maxItems;
    return typeof configured === 'number' && Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_LIST_ITEMS;
  });
  return Math.min(Math.max(...sizes), MAX_LIST_ITEMS);
}

const STATUS_RANK: Record<string, number> = { OFF_TRACK: 0, AT_RISK: 1, ON_TRACK: 2 };

/**
 * The rows a list widget shows, in the order it shows them (problems first,
 * then lowest attainment), cut to what is displayed — a public payload must
 * not carry forty KPIs behind a widget that draws ten.
 */
export function publicListRows(rows: readonly SummaryRow[], size: number): PublicListRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
        (a.attainmentPct ?? Infinity) - (b.attainmentPct ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, size)
    .map(({ kpiId, name, unit, latestValue, status, attainmentPct }) => ({ kpiId, name, unit, latestValue, status, attainmentPct }));
}

/** Strategy-map counts per perspective. KPIs with no perspective are on no tile and are not counted. */
export function perspectiveCounts(rows: ReadonlyArray<Pick<SummaryRow, 'scorecardQuadrant' | 'status'>>): PublicPerspectiveCount[] {
  return PERSPECTIVES.map((perspective) => {
    const mine = rows.filter((r) => r.scorecardQuadrant === perspective);
    const count = (status: KpiHealthStatus) => mine.filter((r) => r.status === status).length;
    return { perspective, total: mine.length, onTrack: count('ON_TRACK'), atRisk: count('AT_RISK'), offTrack: count('OFF_TRACK') };
  });
}
