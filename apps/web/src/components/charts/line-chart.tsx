import { cn } from '@/lib/cn';

export interface LineSeries {
  /** Y values; index is the X position (shared domain across all series). */
  data: number[];
  /** Stroke colour; theme-aware token by default. */
  color?: string;
  /** Render as a dashed line (e.g. forecast / target). */
  dashed?: boolean;
  label?: string;
}

export interface ForecastBand {
  /** Predicted mean line (yhat), one value per X. */
  yhat: number[];
  /** Lower confidence bound per X. */
  lower: number[];
  /** Upper confidence bound per X. */
  upper: number[];
  /** Stroke colour for the yhat line. */
  color?: string;
}

export interface Anomaly {
  /** X index into the domain. */
  index: number;
  /** Y value at the anomaly. */
  value: number;
  label?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  width?: number;
  height?: number;
  /** Forecast overlay: dashed yhat line + shaded confidence band. */
  forecast?: ForecastBand;
  /** Points flagged as anomalous, rendered as error-coloured markers. */
  anomalies?: Anomaly[];
  className?: string;
  'aria-label'?: string;
}

const PAD = 24;

/**
 * Multi-series line chart with optional forecast (yhat + confidence band),
 * dashed series, and anomaly markers. SVG math ported from the design prototype.
 */
export function LineChart({
  series,
  width = 640,
  height = 240,
  forecast,
  anomalies,
  className,
  'aria-label': ariaLabel,
}: LineChartProps) {
  const all: number[] = [
    ...series.flatMap((s) => s.data),
    ...(forecast ? [...forecast.lower, ...forecast.upper, ...forecast.yhat] : []),
    ...(anomalies?.map((a) => a.value) ?? []),
  ];

  if (all.length === 0) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const W = width - PAD * 2;
  const H = height - PAD * 2;

  const maxLen = Math.max(series[0]?.data.length ?? 0, forecast?.yhat.length ?? 0, 1);
  const xAt = (i: number, n: number) => PAD + (n > 1 ? (i / (n - 1)) * W : W / 2);
  const yAt = (v: number) => PAD + H - ((v - min) / range) * H;

  const toPoints = (values: number[]) =>
    values.map((v, i) => `${xAt(i, values.length).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');

  let bandPath: string | undefined;
  if (forecast && forecast.upper.length > 0 && forecast.lower.length > 0) {
    const upper = forecast.upper.map((v, i) => `${xAt(i, forecast.upper.length).toFixed(2)},${yAt(v).toFixed(2)}`);
    const lower = forecast.lower
      .map((v, i) => `${xAt(i, forecast.lower.length).toFixed(2)},${yAt(v).toFixed(2)}`)
      .reverse();
    bandPath = [...upper, ...lower].join(' ');
  }

  const computedLabel =
    ariaLabel ??
    `Line chart with ${series.length} series` +
      (forecast ? ' and forecast' : '') +
      (anomalies && anomalies.length > 0 ? `, ${anomalies.length} anomalies` : '');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block max-w-full', className)}
      role="img"
      aria-label={computedLabel}
    >
      {bandPath && <polygon points={bandPath} fill="hsl(var(--accent-primary))" opacity="0.12" />}

      {series.map((s, si) => (
        <polyline
          key={si}
          points={toPoints(s.data)}
          fill="none"
          stroke={s.color ?? 'hsl(var(--accent-primary))'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={s.dashed ? '4 4' : undefined}
        />
      ))}

      {forecast && (
        <polyline
          points={toPoints(forecast.yhat)}
          fill="none"
          stroke={forecast.color ?? 'hsl(var(--accent-primary))'}
          strokeWidth="2"
          strokeDasharray="4 4"
          opacity="0.7"
        />
      )}

      {anomalies?.map((a, i) => (
        <circle
          key={i}
          cx={xAt(a.index, maxLen)}
          cy={yAt(a.value)}
          r="4"
          fill="hsl(var(--status-critical))"
          stroke="var(--c-surface-bg)"
          strokeWidth="1.5"
        >
          {a.label && <title>{a.label}</title>}
        </circle>
      ))}
    </svg>
  );
}
