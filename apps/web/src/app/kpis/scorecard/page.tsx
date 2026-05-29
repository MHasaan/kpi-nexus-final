'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getDashboardSummary, type DashboardSummaryRow } from '../../../lib/api-client';

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
      router.replace('/login');
      return;
    }
    getDashboardSummary()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  const byQuadrant = (key: string) => (rows ?? []).filter((r) => r.scorecardQuadrant === key);
  const unassigned = (rows ?? []).filter((r) => !r.scorecardQuadrant);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Balanced scorecard</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Balanced Scorecard</h1>
        <p className="mt-1 text-sm text-content-muted">KPIs grouped into the four BSC perspectives, with latest value vs target.</p>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="scorecard-grid">
          {QUADRANTS.map((q) => (
            <QuadrantCard key={q.key} label={q.label} testid={`quadrant-${q.key}`} rows={byQuadrant(q.key)} />
          ))}
        </div>
        {unassigned.length > 0 && (
          <div className="mt-4">
            <QuadrantCard label="Unassigned" testid="quadrant-UNASSIGNED" rows={unassigned} />
          </div>
        )}
      </div>
    </main>
  );
}

function QuadrantCard({ label, rows, testid }: { label: string; rows: DashboardSummaryRow[]; testid: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-content-strong">{label}</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-content-muted">{rows.length}</span>
      </div>
      <ul className="mt-3 space-y-1">
        {rows.map((r) => {
          const onTarget = r.targetValue !== null && r.latestValue !== null ? r.latestValue >= r.targetValue : null;
          return (
            <li key={r.kpiId} className="flex items-center justify-between border-t border-border py-1.5 text-sm">
              <Link href={`/kpis/${r.kpiId}`} className="text-content-strong hover:text-accent-primary">{r.name}</Link>
              <span className="flex items-center gap-2">
                <span className="text-content-muted">{r.latestValue ?? '—'}{r.unit ? ` ${r.unit}` : ''}{r.targetValue !== null ? ` / ${r.targetValue}` : ''}</span>
                {onTarget !== null && (
                  <span className={`inline-block h-2 w-2 rounded-full ${onTarget ? 'bg-status-positive' : 'bg-status-warning'}`} />
                )}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="py-2 text-content-muted">No KPIs.</li>}
      </ul>
    </div>
  );
}
