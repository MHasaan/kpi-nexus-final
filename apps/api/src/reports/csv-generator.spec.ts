/**
 * P3.6 — Generator unit tests.
 *
 * csv-generator: BOM present; header correct; rows match dataset.
 * excel-generator (smoke): returns non-empty Buffer with correct contentType.
 * pdf-generator (smoke): returns non-empty Buffer with correct contentType.
 */

import { describe, expect, test } from 'vitest';

import { generateCsv } from './services/csv-generator.js';
import { generateExcel } from './services/excel-generator.js';
import { generatePdf, sparklinePoints } from './services/pdf-generator.js';
import type { SparklineBox } from './services/pdf-generator.js';
import type { ReportDataset } from './report-dataset.js';

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixture
// ──────────────────────────────────────────────────────────────────────────────

const DATASET: ReportDataset = {
  orgName: 'Test Corp',
  generatedAt: new Date('2026-05-28T12:00:00Z'),
  kpis: [
    {
      id: 'kpi_1',
      name: 'Revenue',
      unit: 'USD',
      latestValue: 1000,
      points: [
        { recordedAt: new Date('2026-05-01T00:00:00Z'), value: 900 },
        { recordedAt: new Date('2026-05-15T00:00:00Z'), value: 1000 },
      ],
    },
    {
      id: 'kpi_2',
      name: 'NPS',
      unit: null,
      latestValue: 72,
      points: [{ recordedAt: new Date('2026-05-20T00:00:00Z'), value: 72 }],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// CSV generator tests
// ──────────────────────────────────────────────────────────────────────────────

describe('generateCsv', () => {
  test('returns Buffer with correct contentType', () => {
    const result = generateCsv(DATASET);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.contentType).toContain('text/csv');
  });

  test('prepends UTF-8 BOM (EF BB BF)', () => {
    const result = generateCsv(DATASET);
    // The BOM in UTF-8 is 0xEF 0xBB 0xBF.
    expect(result.buffer[0]).toBe(0xef);
    expect(result.buffer[1]).toBe(0xbb);
    expect(result.buffer[2]).toBe(0xbf);
  });

  test('CSV header contains expected column names', () => {
    const result = generateCsv(DATASET);
    const text = result.buffer.toString('utf8');
    expect(text).toContain('kpiName');
    expect(text).toContain('recordedAt');
    expect(text).toContain('value');
    expect(text).toContain('unit');
  });

  test('CSV rows contain KPI names and values from dataset', () => {
    const result = generateCsv(DATASET);
    const text = result.buffer.toString('utf8');
    expect(text).toContain('Revenue');
    expect(text).toContain('NPS');
    expect(text).toContain('900');
    expect(text).toContain('1000');
    expect(text).toContain('72');
  });

  test('filename ends with .csv', () => {
    const result = generateCsv(DATASET);
    expect(result.filename).toMatch(/\.csv$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Excel generator smoke test
// ──────────────────────────────────────────────────────────────────────────────

describe('generateExcel (smoke)', () => {
  test('returns non-empty Buffer with xlsx contentType', async () => {
    const result = await generateExcel(DATASET);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
    expect(result.contentType).toContain('spreadsheetml.sheet');
    expect(result.filename).toMatch(/\.xlsx$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PDF generator smoke test
// ──────────────────────────────────────────────────────────────────────────────

describe('generatePdf (smoke)', () => {
  test('returns non-empty Buffer with application/pdf contentType', async () => {
    const result = await generatePdf(DATASET);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toMatch(/\.pdf$/);
  });

  test('PDF starts with %PDF header', async () => {
    const result = await generatePdf(DATASET);
    const header = result.buffer.slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  test('PDF generated with zero data points does not throw', async () => {
    const emptyDataset: ReportDataset = {
      orgName: 'Empty Org',
      generatedAt: new Date('2026-05-28T12:00:00Z'),
      kpis: [
        {
          id: 'kpi_empty',
          name: 'Empty KPI',
          unit: 'USD',
          latestValue: null,
          points: [],
        },
      ],
    };
    const result = await generatePdf(emptyDataset);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  test('PDF generated with a single data point does not throw', async () => {
    const singlePointDataset: ReportDataset = {
      orgName: 'Single Org',
      generatedAt: new Date('2026-05-28T12:00:00Z'),
      kpis: [
        {
          id: 'kpi_single',
          name: 'Single KPI',
          unit: null,
          latestValue: 42,
          points: [{ recordedAt: new Date('2026-05-01T00:00:00Z'), value: 42 }],
        },
      ],
    };
    const result = await generatePdf(singlePointDataset);
    expect(result.buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sparklinePoints pure mapping tests
// ──────────────────────────────────────────────────────────────────────────────

describe('sparklinePoints', () => {
  const BOX: SparklineBox = { x: 0, y: 10, width: 100, height: 40 };

  test('returns empty array for zero values', () => {
    const pts = sparklinePoints([], BOX);
    expect(pts).toHaveLength(0);
  });

  test('returns a single point for one value — placed at horizontal center and vertical mid', () => {
    const pts = sparklinePoints([5], BOX);
    expect(pts).toHaveLength(1);
    // Single point should be horizontally placed at box.x (start) and vertically at mid
    expect(pts[0]).toBeDefined();
    // x should be within the box
    expect(pts[0]!.x).toBeGreaterThanOrEqual(BOX.x);
    expect(pts[0]!.x).toBeLessThanOrEqual(BOX.x + BOX.width);
    // y should be within the box
    expect(pts[0]!.y).toBeGreaterThanOrEqual(BOX.y);
    expect(pts[0]!.y).toBeLessThanOrEqual(BOX.y + BOX.height);
    // No NaN
    expect(Number.isFinite(pts[0]!.x)).toBe(true);
    expect(Number.isFinite(pts[0]!.y)).toBe(true);
  });

  test('flat input (all values equal) maps every point to the same y (mid-line), no NaN', () => {
    const pts = sparklinePoints([7, 7, 7, 7], BOX);
    expect(pts).toHaveLength(4);
    const ys = pts.map((p) => p.y);
    // All y values should be identical
    expect(new Set(ys).size).toBe(1);
    // y should be the vertical midpoint of the box (no NaN / Infinity)
    expect(Number.isFinite(ys[0]!)).toBe(true);
    // y should be within the box bounds
    expect(ys[0]!).toBeGreaterThanOrEqual(BOX.y);
    expect(ys[0]!).toBeLessThanOrEqual(BOX.y + BOX.height);
  });

  test('monotonically increasing values → monotonically decreasing y (PDF origin top-left)', () => {
    // In PDF space: higher value → smaller y (closer to top of box)
    const pts = sparklinePoints([10, 20, 30, 40], BOX);
    expect(pts).toHaveLength(4);
    for (let i = 1; i < pts.length; i++) {
      // As values increase, y should decrease (or stay equal)
      expect(pts[i]!.y).toBeLessThanOrEqual(pts[i - 1]!.y);
    }
    // Strictly monotonic for strictly increasing input
    expect(pts[pts.length - 1]!.y).toBeLessThan(pts[0]!.y);
  });

  test('monotonically increasing values → monotonically increasing x', () => {
    const pts = sparklinePoints([10, 20, 30, 40], BOX);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.x).toBeGreaterThan(pts[i - 1]!.x);
    }
  });

  test('min value maps to the bottom of the box (max y = box.y + box.height)', () => {
    const pts = sparklinePoints([0, 50, 100], BOX);
    // First point is min (0) → y should equal box.y + box.height (bottom)
    expect(pts[0]!.y).toBeCloseTo(BOX.y + BOX.height, 5);
  });

  test('max value maps to the top of the box (min y = box.y)', () => {
    const pts = sparklinePoints([0, 50, 100], BOX);
    // Last point is max (100) → y should equal box.y (top)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(BOX.y, 5);
  });

  test('all points x-coordinates are within box bounds', () => {
    const pts = sparklinePoints([3, 1, 4, 1, 5, 9, 2, 6], BOX);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.x);
      expect(p.x).toBeLessThanOrEqual(BOX.x + BOX.width);
      expect(p.y).toBeGreaterThanOrEqual(BOX.y);
      expect(p.y).toBeLessThanOrEqual(BOX.y + BOX.height);
    }
  });

  test('no NaN or Infinity in output for typical values', () => {
    const pts = sparklinePoints([100, 200, 150, 300, 250], BOX);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
