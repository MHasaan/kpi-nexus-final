'use client';

import type { DataPoint, DashboardWidget, KpiSummary } from '../../lib/api-client';

interface GaugeWidgetProps {
  widget: DashboardWidget;
  kpi?: KpiSummary | null;
  dataPoints?: DataPoint[];
}

/**
 * SVG semicircle gauge showing latest value vs target with threshold zones.
 * The arc goes from left (-180deg) to right (0deg) — 180deg sweep.
 */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polarToXY(cx, cy, r, startDeg);
  const end = polarToXY(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function GaugeWidget({ widget, kpi, dataPoints = [] }: GaugeWidgetProps) {
  const title = widget.title ?? kpi?.name ?? 'Gauge';
  const latest = dataPoints.at(-1);
  const value = latest?.value ?? null;
  const target = kpi?.targetValue ?? null;
  const warning = kpi?.warningThreshold ?? null;
  const critical = kpi?.criticalThreshold ?? null;
  const unit = kpi?.unit ?? '';

  // Gauge spans 180 degrees (left to right semicircle)
  // Map value to angle in range [-180, 0]
  const maxVal = target ?? (value !== null ? value * 1.5 : 100);
  const minVal = 0;
  const fraction =
    value !== null && maxVal > minVal
      ? Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)))
      : 0;
  const angleDeg = -180 + fraction * 180; // from -180 to 0

  const cx = 100;
  const cy = 80;
  const r = 60;

  // Zone arcs
  const critFrac = critical !== null ? (critical - minVal) / (maxVal - minVal) : 0.33;
  const warnFrac = warning !== null ? (warning - minVal) / (maxVal - minVal) : 0.66;
  const critAngle = -180 + critFrac * 180;
  const warnAngle = -180 + warnFrac * 180;

  // Needle
  const needle = polarToXY(cx, cy, r - 5, angleDeg);

  return (
    <div
      className="flex h-full flex-col items-center p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      {value === null ? (
        <div className="flex flex-1 items-center">
          <p className="text-sm text-content-muted">No data</p>
        </div>
      ) : (
        <>
          <svg viewBox="0 0 200 100" className="w-full max-w-[200px]" aria-label={`${title}: ${value}`}>
            {/* Background track */}
            <path
              d={arcPath(cx, cy, r, -180, 0)}
              fill="none"
              stroke="var(--color-border, #e5e7eb)"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Critical zone (red) */}
            <path
              d={arcPath(cx, cy, r, -180, critAngle)}
              fill="none"
              stroke="#ef4444"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Warning zone (amber) */}
            <path
              d={arcPath(cx, cy, r, critAngle, warnAngle)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Good zone (green) */}
            <path
              d={arcPath(cx, cy, r, warnAngle, 0)}
              fill="none"
              stroke="#22c55e"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Needle */}
            <line
              x1={cx}
              y1={cy}
              x2={needle.x}
              y2={needle.y}
              stroke="var(--color-content-strong, #111827)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4} fill="var(--color-content-strong, #111827)" />
          </svg>
          <div className="mt-1 text-center">
            <p className="text-2xl font-bold text-content-strong">
              {value.toLocaleString()}
              {unit && (
                <span className="ml-1 text-sm font-normal text-content-muted">{unit}</span>
              )}
            </p>
            {target !== null && (
              <p className="text-xs text-content-muted">Target: {target}{unit ? ` ${unit}` : ''}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
