'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getDashboardSummary, type DashboardSummaryRow } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, StatTile } from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { useFormat } from '../../../lib/format-context';
import { isOnTarget, onTargetTally } from '../../../lib/kpi-health';

const QUADRANTS: Array<{ key: string; label: string }> = [
  { key: 'FINANCIAL', label: 'Financial' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'INTERNAL_PROCESS', label: 'Internal Process' },
  { key: 'LEARNING_GROWTH', label: 'Learning & Growth' },
];

export default function ScorecardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DashboardSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
  const fmt = useFormat();
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
                    {r.latestValue === null ? '—' : fmt.number(r.latestValue)}
                    {r.targetValue !== null ? ` / ${fmt.number(r.targetValue)}` : ''}
                    {r.unit ? ` ${r.unit}` : ''}
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
                      {/* "Below" was wrong for a lower-is-better KPI over its ceiling: a miss is off target on either side. */}
                      {onTarget ? 'On target' : 'Off target'}
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
