import Papa from 'papaparse';

import type { GeneratedReport, ReportDataset } from '../report-dataset.js';

// UTF-8 BOM — prepended for Excel compatibility.
const BOM = '﻿';

interface CsvRow {
  kpiName: string;
  unit: string;
  recordedAt: string;
  value: number;
}

/**
 * Generates a flat CSV: one row per (KPI × data point).
 * Columns: kpiName, recordedAt (ISO-8601), value, unit.
 * Prepends UTF-8 BOM so Excel opens it without encoding issues.
 */
export function generateCsv(dataset: ReportDataset): GeneratedReport {
  const rows: CsvRow[] = [];

  for (const kpi of dataset.kpis) {
    if (kpi.points.length === 0) {
      // Include at least one row per KPI even if no history, showing the latest.
      rows.push({
        kpiName: kpi.name,
        unit: kpi.unit ?? '',
        recordedAt: '',
        value: kpi.latestValue ?? 0,
      });
    } else {
      for (const point of kpi.points) {
        rows.push({
          kpiName: kpi.name,
          unit: kpi.unit ?? '',
          recordedAt: point.recordedAt.toISOString(),
          value: point.value,
        });
      }
    }
  }

  const csv = Papa.unparse(rows, {
    columns: ['kpiName', 'recordedAt', 'value', 'unit'],
    header: true,
  });

  const slug = dataset.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dateStr = dataset.generatedAt.toISOString().slice(0, 10);

  return {
    buffer: Buffer.from(BOM + csv, 'utf8'),
    filename: `kpi-report-${slug}-${dateStr}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
}
