import { describe, expect, test } from 'vitest';

import { type SummaryRow, perspectiveCounts, publicListRows, publicListSize } from './public-dashboard-view.js';

const row = (name: string, status: SummaryRow['status'], attainmentPct: number | null, scorecardQuadrant: string | null = null): SummaryRow => ({
  kpiId: `id-${name}`,
  name,
  unit: null,
  latestValue: 1,
  status,
  attainmentPct,
  scorecardQuadrant,
});

describe('publicListSize', () => {
  test('no list widget, no rows', () => {
    expect(publicListSize([{ widgetType: 'kpi_card', config: {} }])).toBeNull();
  });

  test('the largest list on the board, ten by default, fifty at most', () => {
    expect(publicListSize([{ widgetType: 'list', config: {} }])).toBe(10);
    expect(publicListSize([{ widgetType: 'list', config: { maxItems: 3 } }, { widgetType: 'list', config: { maxItems: 7 } }])).toBe(7);
    expect(publicListSize([{ widgetType: 'list', config: { maxItems: 5000 } }])).toBe(50);
    expect(publicListSize([{ widgetType: 'list', config: { maxItems: 'lots' } }])).toBe(10);
    expect(publicListSize([{ widgetType: 'list', config: null }])).toBe(10);
  });
});

describe('publicListRows', () => {
  const rows = [row('Healthy', 'ON_TRACK', 120), row('Worst', 'OFF_TRACK', 20), row('Bad', 'OFF_TRACK', 60), row('Wobbly', 'AT_RISK', 90), row('Blank', 'NO_DATA', null)];

  test('problems first, lowest attainment first within a status', () => {
    expect(publicListRows(rows, 10).map((r) => r.name)).toEqual(['Worst', 'Bad', 'Wobbly', 'Healthy', 'Blank']);
  });

  test('only as many rows as the widget draws leave the server', () => {
    expect(publicListRows(rows, 2).map((r) => r.name)).toEqual(['Worst', 'Bad']);
  });

  test('a row carries what the widget draws and nothing else', () => {
    expect(Object.keys(publicListRows([row('A', 'ON_TRACK', 100, 'FINANCIAL')], 1)[0]!).sort()).toEqual(['attainmentPct', 'kpiId', 'latestValue', 'name', 'status', 'unit']);
  });
});

describe('perspectiveCounts', () => {
  test('counts by health per perspective; no names; unassigned KPIs on no tile', () => {
    const counts = perspectiveCounts([
      row('a', 'ON_TRACK', 1, 'FINANCIAL'),
      row('b', 'OFF_TRACK', 1, 'FINANCIAL'),
      row('c', 'NO_TARGET', null, 'FINANCIAL'),
      row('d', 'AT_RISK', 1, 'CUSTOMER'),
      row('e', 'ON_TRACK', 1, null),
    ]);
    expect(counts).toEqual([
      { perspective: 'FINANCIAL', total: 3, onTrack: 1, atRisk: 0, offTrack: 1 },
      { perspective: 'CUSTOMER', total: 1, onTrack: 0, atRisk: 1, offTrack: 0 },
      { perspective: 'INTERNAL_PROCESS', total: 0, onTrack: 0, atRisk: 0, offTrack: 0 },
      { perspective: 'LEARNING_GROWTH', total: 0, onTrack: 0, atRisk: 0, offTrack: 0 },
    ]);
  });
});
