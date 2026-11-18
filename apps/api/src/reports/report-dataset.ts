import type { FormatSettings, KpiHolders } from '@kpi-nexus/contracts';

/**
 * Normalised internal dataset passed from ReportsService into each generator.
 * Generators must not access Prisma / RequestContextStore — they receive this
 * fully-resolved structure.
 */

export interface ReportDataPoint {
  recordedAt: Date;
  value: number;
}

export interface ReportKpi {
  id: string;
  name: string;
  unit: string | null;
  latestValue: number | null;
  /** What the KPI is measured against, from the same summary the pages use (QA-M10). */
  targetValue?: number | null;
  /** ON_TRACK | AT_RISK | OFF_TRACK | NO_TARGET | NO_DATA — the one health rule. */
  status?: string;
  /** Direction-aware percentage of the target reached, or null. */
  attainmentPct?: number | null;
  /** The KPI's scope and, for a per-person or per-unit KPI with several holders in sight, their count (UI-018). */
  scope?: string;
  holders?: KpiHolders | null;
  /** Most recent ~1000 data points, descending. */
  points: ReportDataPoint[];
}

export interface ReportDataset {
  orgName: string;
  generatedAt: Date;
  /** How the organisation writes dates and numbers; the defaults when absent. */
  format?: FormatSettings;
  kpis: ReportKpi[];
}

export interface GeneratedReport {
  buffer: Buffer;
  filename: string;
  contentType: string;
}
