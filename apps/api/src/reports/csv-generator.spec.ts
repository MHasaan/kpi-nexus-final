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
import { generatePdf } from './services/pdf-generator.js';
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
});
