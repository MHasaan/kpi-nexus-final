'use client';

import Link from 'next/link';

import type { DashboardWidget } from '../../lib/api-client';
import { activityLabel } from '../../lib/labels';
import { listActivity } from '../../lib/polish-client';
import { timeAgo } from '../../lib/time-ago';
import { useAsyncData } from '../../lib/use-async-data';
import { useDashboardData } from '../dashboard-grid/dashboard-data';
import { useFormat } from '../../lib/format-context';

interface ActivityWidgetProps {
  widget: DashboardWidget;
}

/**
 * The latest entries of the activity feed. What it shows follows the viewer:
 * the API gives administrators everyone's activity and everyone else their own.
 */
export function ActivityWidget({ widget }: ActivityWidgetProps) {
  const fmt = useFormat();
  const title = widget.title ?? 'Activity';
  const configured = Number(widget.config['maxItems']);
  const limit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 25) : 8;
  // On a live dashboard the feed is read again whenever the board refreshes.
  const refreshKey = useDashboardData()?.refreshKey ?? 0;
  const feed = useAsyncData(() => listActivity({ limit }), [limit, refreshKey]);
  const items = feed.data?.items ?? [];

  return (
    <div className="flex h-full flex-col p-4" data-testid={`widget-render-${widget.id}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{title}</p>
        <Link href="/activity" className="text-xs font-medium text-accent-primary hover:underline">
          See all activity
        </Link>
      </div>
      {feed.error && !feed.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center" role="alert">
          <p className="text-xs text-status-critical">{feed.error}</p>
          <button type="button" className="text-xs text-accent-primary underline" onClick={feed.reload}>
            Try again
          </button>
        </div>
      ) : !feed.data ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-content-muted">Loading…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="text-sm text-content-muted">Nothing has happened yet. Changes to KPIs, values and dashboards appear here.</p>
        </div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-auto">
          {items.map((item) => (
            <li key={item.id} data-testid="activity-row" className="flex items-baseline justify-between gap-3 rounded bg-surface-bg px-2 py-1.5 text-sm">
              <span className="min-w-0 truncate text-content-default">
                <span className="font-medium text-content-strong">{item.userName ?? 'Someone'}</span> {activityLabel(item.action, item.entityType)}
              </span>
              <time dateTime={item.createdAt} title={fmt.dateTime(item.createdAt)} className="shrink-0 text-xs tabular-nums text-content-muted">
                {timeAgo(item.createdAt, new Date(), fmt.date)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
