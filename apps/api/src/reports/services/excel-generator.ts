import ExcelJS from 'exceljs';

import type { GeneratedReport, ReportDataset } from '../report-dataset.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Generates an xlsx workbook:
 *   Sheet 1 "Overview" — one row per KPI (name, latestValue, unit).
 *   One additional sheet per KPI — recordedAt + value history.
 * Headers are bold; first row is frozen.
 */
export async function generateExcel(dataset: ReportDataset): Promise<GeneratedReport> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KPI Nexus';
  wb.created = dataset.generatedAt;

  // ── Sheet 1: Overview ─────────────────────────────────────────────────────
  const overview = wb.addWorksheet('Overview');
  overview.columns = [
    { header: 'KPI Name', key: 'name', width: 36 },
    { header: 'Latest Value', key: 'latestValue', width: 18 },
    { header: 'Unit', key: 'unit', width: 14 },
  ];
  // Bold + freeze header row.
  const overviewHeader = overview.getRow(1);
  overviewHeader.font = { bold: true };
  overview.views = [{ state: 'frozen', ySplit: 1 }];

  for (const kpi of dataset.kpis) {
    overview.addRow({ name: kpi.name, latestValue: kpi.latestValue ?? '', unit: kpi.unit ?? '' });
  }

  // ── Per-KPI history sheets ────────────────────────────────────────────────
  for (const kpi of dataset.kpis) {
    // Excel sheet names max 31 chars; strip illegal chars.
    const sheetName = kpi.name.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
    const sheet = wb.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'Recorded At', key: 'recordedAt', width: 26 },
      { header: 'Value', key: 'value', width: 16 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const pt of kpi.points) {
      sheet.addRow({ recordedAt: pt.recordedAt.toISOString(), value: pt.value });
    }
  }

  const slug = dataset.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dateStr = dataset.generatedAt.toISOString().slice(0, 10);

  const raw = await wb.xlsx.writeBuffer();
  // ExcelJS returns Buffer | ArrayBuffer depending on env; normalise.
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

  return {
    buffer,
    filename: `kpi-report-${slug}-${dateStr}.xlsx`,
    contentType: XLSX_MIME,
  };
}
