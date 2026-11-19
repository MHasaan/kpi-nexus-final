import { describe, expect, test } from 'vitest';

import type { PublicWidget } from './api-client';
import { readingOrder, shareCell, shareKpi, shareWidget } from './share-view';

const widget = (patch: Partial<PublicWidget> = {}): PublicWidget => ({
  id: 'w1',
  widgetType: 'line',
  title: null,
  config: { kpiId: 'k1' },
  position: { x: 0, y: 0, w: 6, h: 3 },
  sortOrder: 0,
  ...patch,
});

describe('shareWidget', () => {
  test('a known kind becomes a dashboard widget', () => {
    expect(shareWidget(widget())).toMatchObject({ id: 'w1', widgetType: 'line', config: { kpiId: 'k1' } });
  });

  test('a kind this page does not know is not guessed at', () => {
    expect(shareWidget(widget({ widgetType: 'hologram' }))).toBeNull();
  });
});

describe('shareKpi', () => {
  const kpis = { k1: { name: 'Revenue', unit: null, direction: 'HIGHER_IS_BETTER', targetValue: 100, warningThreshold: null, criticalThreshold: null, status: 'ON_TRACK' as const, series: [] } };

  test('finds the KPI the widget points at', () => {
    expect(shareKpi(widget(), { kpis })?.name).toBe('Revenue');
  });

  test('null when the widget has no KPI, the KPI was withheld, or the API is older', () => {
    expect(shareKpi(widget({ config: {} }), { kpis })).toBeNull();
    expect(shareKpi(widget({ config: { kpiId: 'withheld' } }), { kpis })).toBeNull();
    expect(shareKpi(widget(), {})).toBeNull();
  });
});

describe('shareCell', () => {
  // Flow walk (dashboards): an old fault saved new widgets one cell by one. On the shared page such a
  // widget was drawn in that one cell: a sliver with its title cut off.
  test('a widget saved smaller than two cells by two is not pinned to that sliver: it flows at the usual size', () => {
    expect(shareCell({ x: 0, y: 2, w: 1, h: 1 })).toBeNull();
    expect(shareCell({ x: 0, y: 2, w: 3, h: 1 })).toBeNull();
    expect(shareCell({ x: 0, y: 2, w: 2, h: 2 })).toEqual({ column: '1 / span 2', row: '3 / span 2' });
  });

  test('grid lines from the stored position', () => {
    expect(shareCell({ x: 4, y: 2, w: 8, h: 3 })).toEqual({ column: '5 / span 8', row: '3 / span 3' });
  });

  test('a widget wider than the room left is cut to fit', () => {
    expect(shareCell({ x: 8, y: 0, w: 8, h: 2 })).toEqual({ column: '9 / span 4', row: '1 / span 2' });
  });

  test('an unusable position flows instead', () => {
    expect(shareCell(null)).toBeNull();
    expect(shareCell({ x: 0, y: 0 })).toBeNull();
    expect(shareCell({ x: 12, y: 0, w: 2, h: 2 })).toBeNull();
    expect(shareCell({ x: 0, y: 0, w: 0, h: 2 })).toBeNull();
    expect(shareCell({ x: 0.5, y: 0, w: 2, h: 2 })).toBeNull();
  });
});

describe('readingOrder', () => {
  test('top to bottom, then left to right', () => {
    const order = readingOrder([
      widget({ id: 'bottom', position: { x: 0, y: 3, w: 12, h: 2 } }),
      widget({ id: 'top-right', position: { x: 6, y: 0, w: 6, h: 3 } }),
      widget({ id: 'top-left', position: { x: 0, y: 0, w: 6, h: 3 } }),
    ]);
    expect(order.map((w) => w.id)).toEqual(['top-left', 'top-right', 'bottom']);
  });
});
