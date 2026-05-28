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
  /** Most recent ~1000 data points, descending. */
  points: ReportDataPoint[];
}

export interface ReportDataset {
  orgName: string;
  generatedAt: Date;
  kpis: ReportKpi[];
}

export interface GeneratedReport {
  buffer: Buffer;
  filename: string;
  contentType: string;
}
