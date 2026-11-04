'use client';

import type { DashboardSummaryRow, DashboardWidget } from '../../lib/api-client';

interface ListWidgetProps {
  widget: DashboardWidget;
  summaryRows?: DashboardSummaryRow[];
}

// Server-computed, direction-aware status (FE-001): the old latest/target ratio
// painted an over-target lower-is-better KPI (e.g. churn) green.
const STATUS_COLOR: Record<string, string> = {
  OFF_TRACK: 'text-status-critical',
  AT_RISK: 'text-status-warning',
  ON_TRACK: 'text-status-success',
};
// Problems first, then healthy, then no target / no data.
const STATUS_RANK: Record<string, number> = { OFF_TRACK: 0, AT_RISK: 1, ON_TRACK: 2 };

function statusColor(row: DashboardSummaryRow): string {
  return STATUS_COLOR[row.status] ?? 'text-content-muted';
}

export function ListWidget({ widget, summaryRows = [] }: ListWidgetProps) {
  const title = widget.title ?? 'KPI List';
  const maxItems = (widget.config['maxItems'] as number | undefined) ?? 10;

  // Sort by status (off track first), then lowest attainment within a status.
  const sorted = [...summaryRows]
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
        (a.attainmentPct ?? Infinity) - (b.attainmentPct ?? Infinity),
    )
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
