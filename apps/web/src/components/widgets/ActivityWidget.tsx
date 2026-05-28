'use client';

import type { DashboardWidget } from '../../lib/api-client';

interface ActivityWidgetProps {
  widget: DashboardWidget;
}

export function ActivityWidget({ widget }: ActivityWidgetProps) {
  const title = widget.title ?? 'Activity';

  return (
    <div
      className="flex h-full flex-col p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-border p-4 text-center">
        <svg
          className="mb-2 h-8 w-8 text-content-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm font-medium text-content-muted">
          Activity feed — coming soon
        </p>
        <p className="mt-1 text-xs text-content-muted">
          Recent changes to KPIs and dashboards will appear here.
        </p>
      </div>
    </div>
  );
}
