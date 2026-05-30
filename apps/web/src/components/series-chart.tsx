'use client';

/**
 * Dependency-free SVG line chart with an optional confidence band and point
 * markers. Used by the anomaly + forecast pages. Values are plotted on a shared
 * y-scale; `markers` highlights specific indices (e.g. anomalies).
 */
export interface SeriesChartProps {
  values: number[];
  /** Optional per-point lower/upper band (same length as values). */
  band?: { lower: number[]; upper: number[] };
  /** Indices to highlight with a filled marker. */
  markers?: number[];
  width?: number;
  height?: number;
  testId?: string;
}

export function SeriesChart({ values, band, markers = [], width = 640, height = 200, testId }: SeriesChartProps) {
  const pad = 12;
  const all = [
    ...values,
    ...(band ? [...band.lower, ...band.upper] : []),
  ].filter((v) => Number.isFinite(v));
  if (values.length === 0 || all.length === 0) {
    return (
      <div data-testid={testId} className="rounded border border-border bg-surface-bg p-6 text-center text-sm text-content-muted">
        No data to plot.
      </div>
    );
  }

  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = values.length;
  const x = (i: number) => pad + (n === 1 ? 0 : (i / (n - 1)) * (width - 2 * pad));
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);

  const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  let bandPath = '';
  if (band && band.lower.length === n && band.upper.length === n) {
    const top = band.upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const bottom = band.lower
      .map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(band.lower[n - 1 - i]!).toFixed(1)}`)
      .join(' ');
    bandPath = `${top} ${bottom} Z`;
  }

  return (
    <svg
      data-testid={testId}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded border border-border bg-surface-bg"
      role="img"
      aria-label="series chart"
    >
      {bandPath && <path d={bandPath} className="fill-accent-primary/10" />}
      <path d={linePath} className="fill-none stroke-accent-primary" strokeWidth={1.5} />
      {markers.map((i) =>
        values[i] === undefined ? null : (
          <circle key={i} cx={x(i)} cy={y(values[i]!)} r={4} className="fill-status-critical" data-testid="chart-marker" />
        ),
      )}
    </svg>
  );
}
