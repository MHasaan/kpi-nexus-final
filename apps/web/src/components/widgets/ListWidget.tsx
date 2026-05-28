'use client';

import type { DashboardSummaryRow, DashboardWidget } from '../../lib/api-client';

interface ListWidgetProps {
  widget: DashboardWidget;
  summaryRows?: DashboardSummaryRow[];
}

function statusColor(row: DashboardSummaryRow): string {
  if (!row.latestValue || !row.targetValue) return 'text-content-muted';
  const pct = row.latestValue / row.targetValue;
  if (pct < 0.5) return 'text-status-critical';
  if (pct < 0.8) return 'text-status-warning';
  return 'text-status-success';
}

export function ListWidget({ widget, summaryRows = [] }: ListWidgetProps) {
  const title = widget.title ?? 'KPI List';
  const maxItems = (widget.config['maxItems'] as number | undefined) ?? 10;

  // Sort by at-risk: lowest (latestValue / targetValue) first
  const sorted = [...summaryRows]
    .sort((a, b) => {
      const ar = a.targetValue ? (a.latestValue ?? 0) / a.targetValue : 1;
      const br = b.targetValue ? (b.latestValue ?? 0) / b.targetValue : 1;
      return ar - br;
    })
    .slice(0, maxItems);

  return (
    <div
      className="flex h-full flex-col p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-content-muted">No data</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-auto space-y-1">
          {sorted.map((row) => (
            <li
              key={row.kpiId}
              className="flex items-center justify-between rounded bg-surface-bg px-2 py-1.5 text-sm"
            >
              <span className="truncate text-content-default" title={row.name}>
                {row.name}
              </span>
              <span className={`ml-2 font-semibold tabular-nums ${statusColor(row)}`}>
                {row.latestValue !== null ? row.latestValue.toLocaleString() : '—'}
                {row.unit ? ` ${row.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
