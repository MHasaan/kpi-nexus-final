import PDFDocument from 'pdfkit';

import type { GeneratedReport, ReportDataset } from '../report-dataset.js';

/**
 * Bounding box passed to sparkline helpers. Origin (x, y) is the top-left
 * corner in PDF coordinate space (y increases downward).
 */
export interface SparklineBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single 2-D coordinate in PDF space. */
export interface SparklinePoint {
  x: number;
  y: number;
}

/**
 * Pure mapping function — converts an array of numeric values (chronological
 * order, oldest first) into an array of {x, y} coordinates within the given
 * bounding box.
 *
 * PDF coordinate system: y increases downward, so a *higher* value maps to a
 * *smaller* y (closer to the top of the box).
 *
 * Edge cases:
 *  - 0 values → empty array.
 *  - 1 value  → single point horizontally at box.x, vertically centred.
 *  - All values equal → every point shares the same mid-y (no divide-by-zero).
 */
export function sparklinePoints(values: number[], box: SparklineBox): SparklinePoint[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const n = values.length;
  const bottom = box.y + box.height; // highest y value in PDF space (visual bottom)
  const top = box.y; // lowest y value in PDF space (visual top)

  return values.map((v, i) => {
    // X: evenly distributed across the box width.
    // With a single point place it at the left edge; with multiple points
    // spread from left to right edge.
    const x = n === 1 ? box.x : box.x + (i / (n - 1)) * box.width;

    // Y: range === 0 means all values are equal → draw at vertical mid-line.
    const normalised = range === 0 ? 0.5 : (v - min) / range;
    // Higher normalised value → closer to top (smaller y in PDF space).
    const y = bottom - normalised * (bottom - top);

    return { x, y };
  });
}

/**
 * Draws a sparkline polyline on the pdfkit document within the supplied box.
 * Uses vector primitives (moveTo / lineTo / stroke) — no images, no canvas.
 *
 * Handles 0 points (no-op), 1 point (filled circle), and multiple points
 * (polyline). An optional faint baseline is drawn at the bottom of the box.
 */
function drawSparkline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfkit has no TS types in this version
  doc: any,
  values: number[],
  box: SparklineBox,
): void {
  if (values.length === 0) return;

  const pts = sparklinePoints(values, box);

  // Faint baseline
  doc
    .save()
    .moveTo(box.x, box.y + box.height)
    .lineTo(box.x + box.width, box.y + box.height)
    .strokeColor('#e0e0e0')
    .lineWidth(0.5)
    .stroke()
    .restore();

  if (pts.length === 1) {
    // Single point → draw a small dot at the mid-line position.
    const pt = pts[0]!;
    doc.save().circle(pt.x, pt.y, 2).fillColor('#2563eb').fill().restore();
    return;
  }

  // Build the polyline path.
  doc.save().strokeColor('#2563eb').lineWidth(1.5);

  const first = pts[0]!;
  doc.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    doc.lineTo(p.x, p.y);
  }
  doc.stroke().restore();

  // Min / max endpoint dots for visual anchoring.
  const last = pts[pts.length - 1]!;
  doc.save().fillColor('#2563eb');
  doc.circle(first.x, first.y, 2).fill();
  doc.circle(last.x, last.y, 2).fill();
  doc.restore();
}

/**
 * Generates a PDF report using pdfkit (imperative, no JSX required).
 * Structure:
 *   - Cover page: org name, generated date, title.
 *   - Per-KPI sections: name, latest value + unit, sparkline of recent points.
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
    const pageMargin = 50;
    const sparklineWidth = doc.page.width - pageMargin * 2;
    const sparklineHeight = 50;

    for (const kpi of dataset.kpis) {
      // Section heading
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a1a').text(kpi.name);
      doc.moveDown(0.3);

      const unit = kpi.unit ? ` ${kpi.unit}` : '';
      const latest = kpi.latestValue !== null ? `${kpi.latestValue}${unit}` : 'No data';
      doc.fontSize(12).font('Helvetica').fillColor('#333333').text(`Latest value: ${latest}`);
      doc.moveDown(0.4);

      // Sparkline — replace former text list of data points.
      const sparkX = pageMargin;

      // Chronological order (oldest→newest): points are stored descending, so reverse.
      const chronoValues = kpi.points
        .slice() // shallow copy to avoid mutating dataset
        .reverse()
        .map((p) => p.value);

      if (chronoValues.length > 0) {
        doc.fontSize(9).fillColor('#888888').text('Trend (last 1 000 points):', { continued: false });
        doc.moveDown(0.15);
      }

      const boxY = doc.y;
      drawSparkline(doc, chronoValues, {
        x: sparkX,
        y: boxY,
        width: sparklineWidth,
        height: sparklineHeight,
      });

      // Advance the cursor past the sparkline box.
      doc.y = boxY + sparklineHeight;

      if (chronoValues.length === 0) {
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
