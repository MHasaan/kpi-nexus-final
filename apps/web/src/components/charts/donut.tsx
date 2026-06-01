import { cn } from '@/lib/cn';

export interface DonutDatum {
  label: string;
  value: number;
  /** Theme-aware token by default; pass any CSS colour to override. */
  color?: string;
}

export interface DonutProps {
  data: DonutDatum[];
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  /** Large number rendered in the hole (e.g. a total). */
  centerValue?: string | number;
  /** Caption under the centre value. */
  centerLabel?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Donut / ring chart. Each segment is a stroked circle arc (dasharray slice),
 * rotated so the series starts at 12 o'clock. SVG-only + theme-aware via
 * hsl(var(--…)) — matches the Sparkline/Bar/Line chart house style.
 */
export function Donut({
  data,
  size = 160,
  thickness = 22,
  centerValue,
  centerLabel,
  className,
  'aria-label': ariaLabel,
}: DonutProps) {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('block', className)}
      role="img"
      aria-label={ariaLabel ?? `Donut chart of ${data.length} segments`}
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="hsl(var(--border-divider))"
        strokeWidth={thickness}
      />
      {total > 0 &&
        data.map((d, i) => {
          const value = Math.max(0, d.value);
          if (value === 0) return null;
          const len = (value / total) * circumference;
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={d.color ?? 'hsl(var(--accent-primary))'}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cx})`}
            >
              <title>{`${d.label}: ${value}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
      {(centerValue !== undefined || centerLabel) && (
        <g>
          {centerValue !== undefined && (
            <text
              x={cx}
              y={centerLabel ? cx - 2 : cx}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-[hsl(var(--content-strong))] font-bold tabular-nums"
              style={{ fontSize: size * 0.2 }}
            >
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text
              x={cx}
              y={cx + size * 0.12}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-[hsl(var(--content-muted))]"
              style={{ fontSize: size * 0.08 }}
            >
              {centerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
