import { cn } from '@/lib/cn';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke colour; theme-aware token by default. */
  stroke?: string;
  /** When true, the SVG scales fluidly to its container width. */
  fluid?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Compact trend line with no axes. Theme-aware via hsl(var(--…)). */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = 'hsl(var(--accent-primary))',
  fluid = false,
  className,
  'aria-label': ariaLabel = 'Trend sparkline',
}: SparklineProps) {
  const dims = fluid
    ? ({ width: '100%', height, className: cn('block', className) } as const)
    : ({ width, height, className } as const);

  if (data.length < 2) {
    return <svg {...dims} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      {...dims}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect={fluid ? 'non-scaling-stroke' : undefined}
      />
    </svg>
  );
}
