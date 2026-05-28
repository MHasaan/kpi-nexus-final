import PDFDocument from 'pdfkit';

import type { GeneratedReport, ReportDataset } from '../report-dataset.js';

/**
 * Generates a PDF report using pdfkit (imperative, no JSX required).
 * Structure:
 *   - Cover page: org name, generated date, title.
 *   - Per-KPI sections: name, latest value + unit, last 10 data points listed.
 * Returns as Buffer (collected by consuming the pdfkit writable stream).
 */
export async function generatePdf(dataset: ReportDataset): Promise<GeneratedReport> {
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Cover page ───────────────────────────────────────────────────────────
    doc.fontSize(28).font('Helvetica-Bold').text('KPI Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text(dataset.orgName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#555555').text(`Generated: ${dataset.generatedAt.toUTCString()}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(2);
    doc.fontSize(11).text(`Total KPIs: ${dataset.kpis.length}`, { align: 'center' });
    doc.addPage();

    // ── Per-KPI sections ─────────────────────────────────────────────────────
    for (const kpi of dataset.kpis) {
      // Section heading
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a1a').text(kpi.name);
      doc.moveDown(0.3);

      const unit = kpi.unit ? ` ${kpi.unit}` : '';
      const latest = kpi.latestValue !== null ? `${kpi.latestValue}${unit}` : 'No data';
      doc.fontSize(12).font('Helvetica').fillColor('#333333').text(`Latest value: ${latest}`);
      doc.moveDown(0.5);

      // Recent history (up to 10 most-recent points)
      const recentPoints = kpi.points.slice(0, 10);
      if (recentPoints.length > 0) {
        doc.fontSize(10).fillColor('#555555').text('Recent history:');
        doc.moveDown(0.2);
        for (const pt of recentPoints) {
          doc.text(`  ${pt.recordedAt.toISOString().slice(0, 10)}  →  ${pt.value}${unit}`);
        }
      } else {
        doc.fontSize(10).fillColor('#888888').text('No historical data points recorded.');
      }

      doc.fillColor('#000000');
      doc.moveDown(1.5);

      // Add a page break between KPIs if there are more (avoid orphaned headers).
      if (kpi !== dataset.kpis[dataset.kpis.length - 1]) {
        if (doc.y > 650) {
          doc.addPage();
        }
      }
    }

    doc.end();
  });

  const slug = dataset.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dateStr = dataset.generatedAt.toISOString().slice(0, 10);

  return {
    buffer,
    filename: `kpi-report-${slug}-${dateStr}.pdf`,
    contentType: 'application/pdf',
  };
}
