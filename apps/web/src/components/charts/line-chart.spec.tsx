/**
 * Flow walk (forecast): the forecast was drawn across the same span as the
 * history, underneath it — as if it were a second past. A forecast is what
 * comes next: it must start where the history ends and run on to the right.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { LineChart } from './line-chart';

type Point = { x: number; y: number };
const points = (attr: string): Point[] =>
  attr
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number))
    .map(([x, y]) => ({ x: x!, y: y! }));
const all = (svg: string, tag: string): Point[][] => [...svg.matchAll(new RegExp(`<${tag}[^>]*points="([^"]+)"`, 'g'))].map((m) => points(m[1]!));

describe('LineChart with a forecast', () => {
  const svg = renderToStaticMarkup(
    <LineChart
      width={640}
      height={240}
      series={[{ data: [10, 20, 30, 40], label: 'Actual' }]}
      forecast={{ yhat: [50, 60], lower: [45, 50], upper: [55, 70] }}
    />,
  );
  const [history, forecast] = all(svg, 'polyline') as [Point[], Point[]];
  const [band] = all(svg, 'polygon') as [Point[]];

  test('the history ends before the right-hand edge, leaving room for what comes next', () => {
    expect(history).toHaveLength(4);
    expect(history[0]!.x).toBe(24);
    expect(history[3]!.x).toBeLessThan(640 - 24);
  });

  test('the forecast starts at the last actual value and runs on to the right-hand edge', () => {
    expect(forecast[0]).toEqual(history[3]);
    expect(forecast).toHaveLength(3); // the joining point, then one per forecast period
    expect(forecast[1]!.x).toBeGreaterThan(history[3]!.x);
    expect(forecast[2]!.x).toBe(640 - 24);
  });

  test('the band covers the forecast periods only', () => {
    expect(Math.min(...band.map((p) => p.x))).toBe(forecast[1]!.x);
    expect(Math.max(...band.map((p) => p.x))).toBe(640 - 24);
  });
});

describe('LineChart without a forecast', () => {
  test('a series still spans the whole width', () => {
    const svg = renderToStaticMarkup(<LineChart width={640} height={240} series={[{ data: [1, 2, 3] }]} />);
    const [line] = all(svg, 'polyline') as [Point[]];
    expect(line.map((p) => p.x)).toEqual([24, 320, 616]);
  });
});
