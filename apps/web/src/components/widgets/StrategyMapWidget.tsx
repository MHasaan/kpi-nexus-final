'use client';

import Link from 'next/link';

import type { DashboardSummaryRow, DashboardWidget } from '../../lib/api-client';
import { QUADRANT_LABELS, labelFor } from '../../lib/labels';

import { type PerspectiveTally, type StrategyMapTally, kpiCount, strategyMapTally, tallyWords } from './strategy-map';

interface StrategyMapWidgetProps {
  widget: DashboardWidget;
  summaryRows?: DashboardSummaryRow[];
  /** Counts worked out elsewhere, used instead of `summaryRows` (the public share page). */
  tally?: StrategyMapTally;
  /** False where the reader has no account to follow a link with. */
  linked?: boolean;
}

// A tile takes the colour of the worst KPI in it.
const TILE_TONE: Record<PerspectiveTally['worst'], string> = {
  OFF_TRACK: 'border-status-critical/40 bg-status-critical-bg',
  AT_RISK: 'border-status-warning/40 bg-status-warning/10',
  ON_TRACK: 'border-status-success/40 bg-status-success/10',
  NONE: 'border-border bg-surface-bg',
};

/** The four balanced-scorecard perspectives, each with how many of its KPIs are on track, at risk and off track. */
export function StrategyMapWidget({ widget, summaryRows = [], tally: given, linked = true }: StrategyMapWidgetProps) {
  const title = widget.title ?? 'Strategy map';
  const tally = given ?? strategyMapTally(summaryRows);

  return (
    <div className="flex h-full flex-col p-4" data-testid={`widget-render-${widget.id}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{title}</p>
        {linked && (
          <Link href="/kpis/scorecard" className="text-xs font-medium text-accent-primary hover:underline">
            Open the scorecard
          </Link>
        )}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {tally.perspectives.map((p) => (
          <div key={p.perspective} data-testid={`perspective-${p.perspective}`} className={`flex flex-col justify-between rounded-md border p-2 ${TILE_TONE[p.worst]}`}>
            <span className="text-xs font-semibold text-content-strong">{labelFor(QUADRANT_LABELS, p.perspective)}</span>
            <div>
              <p className="text-lg font-bold tabular-nums text-content-strong">{kpiCount(p.total)}</p>
              {p.total > 0 && <p className="text-xs text-content-muted">{tallyWords(p)}</p>}
            </div>
          </div>
        ))}
      </div>
      {linked && tally.unassigned > 0 && (
        <p className="mt-2 text-xs text-content-muted" data-testid="strategy-unassigned">
          {tally.unassigned === 1 ? '1 KPI has no perspective and is not counted above.' : `${tally.unassigned} KPIs have no perspective and are not counted above.`} Choose one on the KPI’s edit page.
        </p>
      )}
    </div>
  );
}
