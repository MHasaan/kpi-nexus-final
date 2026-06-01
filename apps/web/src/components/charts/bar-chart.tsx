import { cn } from '@/lib/cn';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional per-bar colour override; theme-aware token by default. */
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  width?: number;
  height?: number;
  className?: string;
  'aria-label'?: string;
}

const PAD = 24;

/** Vertical bar chart. SVG math ported from the design prototype; theme-aware via hsl(var(--…)). */
export function BarChart({ data, width = 640, height = 240, className, 'aria-label': ariaLabel }: BarChartProps) {
  if (data.length === 0) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const max = Math.max(...data.map((d) => d.value)) || 1;
  const W = width - PAD * 2;
  const H = height - PAD * 2;
  const slot = W / data.length;
  const bw = slot * 0.7;
  const gap = slot * 0.3;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block max-w-full', className)}
      role="img"
      aria-label={ariaLabel ?? `Bar chart with ${data.length} bars`}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * H;
        const x = PAD + i * (bw + gap);
        const y = PAD + H - h;
        return (
          <rect key={i} x={x} y={y} width={bw} height={h} rx="4" fill={d.color ?? 'hsl(var(--accent-primary))'}>
            <title>{`${d.label}: ${d.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
