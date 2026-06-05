'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getDashboardSummary, type DashboardSummaryRow } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, StatTile } from '../../../components/ui';

const QUADRANTS: Array<{ key: string; label: string }> = [
  { key: 'FINANCIAL', label: 'Financial' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'INTERNAL_PROCESS', label: 'Internal Process' },
  { key: 'LEARNING_GROWTH', label: 'Learning & Growth' },
];

/**
 * Whether a row is on target. Mirrors the per-row logic exactly:
 * a row is comparable only when both target and latest values exist,
 * and is on-target when latest >= target. Returns null when not comparable.
 */
function isOnTarget(r: DashboardSummaryRow): boolean | null {
  return r.targetValue !== null && r.latestValue !== null ? r.latestValue >= r.targetValue : null;
}

/** Count comparable rows (have both target + latest) and how many are on target. */
function onTargetTally(rows: DashboardSummaryRow[]): { onTarget: number; comparable: number } {
  let onTarget = 0;
  let comparable = 0;
  for (const r of rows) {
    const result = isOnTarget(r);
    if (result === null) continue;
    comparable += 1;
    if (result) onTarget += 1;
  }
  return { onTarget, comparable };
}

export default function ScorecardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DashboardSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getDashboardSummary()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  const byQuadrant = (key: string) => (rows ?? []).filter((r) => r.scorecardQuadrant === key);
  const unassigned = (rows ?? []).filter((r) => !r.scorecardQuadrant);
  const overall = rows ? onTargetTally(rows) : null;

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Scorecard"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Scorecard' },
      ]}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong">Balanced Scorecard</h1>
          <p className="text-sm text-content-muted">
            KPIs grouped into the four BSC perspectives, with latest value vs target.
          </p>
        </div>

        <KpiSubnav />

        {overall && (
          <div className="grid gap-4 sm:grid-cols-3" data-testid="scorecard-summary">
            <StatTile
              label="On target"
              value={`${overall.onTarget} / ${overall.comparable}`}
              unit="KPIs"
            />
            <StatTile label="Tracked" value={rows?.length ?? 0} unit="KPIs" />
            <StatTile
              label="On-target rate"
              value={overall.comparable > 0 ? `${Math.round((overall.onTarget / overall.comparable) * 100)}%` : '—'}
            />
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {rows === null && !error && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2" data-testid="scorecard-grid">
          {QUADRANTS.map((q) => (
            <QuadrantCard key={q.key} label={q.label} testid={`quadrant-${q.key}`} rows={byQuadrant(q.key)} />
          ))}
        </div>
        {unassigned.length > 0 && (
          <QuadrantCard label="Unassigned" testid="quadrant-UNASSIGNED" rows={unassigned} />
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}

function QuadrantCard({ label, rows, testid }: { label: string; rows: DashboardSummaryRow[]; testid: string }) {
  const tally = onTargetTally(rows);
  return (
    <Card data-testid={testid}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <div className="flex items-center gap-2">
          {tally.comparable > 0 && (
            <Badge tone={tally.onTarget === tally.comparable ? 'success' : 'warning'} data-testid={`${testid}-ontarget`}>
              {tally.onTarget}/{tally.comparable} on target
            </Badge>
          )}
          <Badge tone="neutral">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {rows.map((r) => {
            const onTarget = isOnTarget(r);
            return (
              <li
                key={r.kpiId}
                className="flex items-center justify-between border-t border-border-divider py-1.5 text-sm first:border-0"
              >
                <Link href={`/kpis/${r.kpiId}`} className="text-content-strong hover:text-accent-primary">
                  {r.name}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-content-muted">
                    {r.latestValue ?? '—'}
                    {r.unit ? ` ${r.unit}` : ''}
                    {r.targetValue !== null ? ` / ${r.targetValue}` : ''}
                  </span>
                  {onTarget !== null && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        onTarget ? 'text-status-positive' : 'text-status-warning'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-2 w-2 rounded-full ${
                          onTarget ? 'bg-status-positive' : 'bg-status-warning'
                        }`}
                      />
                      {onTarget ? 'On target' : 'Below'}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
          {rows.length === 0 && <li className="py-2 text-content-muted">No KPIs.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
