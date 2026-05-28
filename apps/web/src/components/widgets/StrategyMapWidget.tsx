'use client';

import type { DashboardWidget } from '../../lib/api-client';

interface StrategyMapWidgetProps {
  widget: DashboardWidget;
}

const QUADRANTS = [
  {
    label: 'Financial',
    icon: '💰',
    description: 'Revenue, profitability, cost efficiency',
    color: 'border-accent-primary/30 bg-accent-primary/5',
  },
  {
    label: 'Customer',
    icon: '👥',
    description: 'Satisfaction, retention, NPS',
    color: 'border-status-success/30 bg-status-success/5',
  },
  {
    label: 'Internal',
    icon: '⚙️',
    description: 'Process quality, cycle time, capacity',
    color: 'border-status-warning/30 bg-status-warning/5',
  },
  {
    label: 'Learning',
    icon: '📚',
    description: 'Employee growth, innovation, culture',
    color: 'border-status-info/30 bg-status-info/5',
  },
];

export function StrategyMapWidget({ widget }: StrategyMapWidgetProps) {
  const title = widget.title ?? 'Strategy Map';

  return (
    <div
      className="flex h-full flex-col p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      <p className="mb-2 text-xs text-content-muted">
        Balanced Scorecard — read-only overview
      </p>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {QUADRANTS.map((q) => (
          <div
            key={q.label}
            className={`flex flex-col rounded-md border p-2 ${q.color}`}
          >
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true">{q.icon}</span>
              <span className="text-xs font-semibold text-content-strong">
                {q.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-content-muted">{q.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
