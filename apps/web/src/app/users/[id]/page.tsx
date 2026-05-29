'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, getAccessToken, listUserKpis, type MyKpiRow } from '../../../lib/api-client';

export default function UserKpiPanelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<MyKpiRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) { router.replace('/login'); return; }
    listUserKpis(params.id).then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [params.id, router]);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/users" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">User KPIs</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link href="/users" className="text-sm text-content-muted hover:text-content-strong">← Back to users</Link>
        <h1 className="mt-2 text-2xl font-semibold text-content-strong">Assigned KPIs</h1>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}
        <div className="mt-6 rounded-lg border border-border bg-surface-1" data-testid="user-kpis-list">
          {(rows ?? []).map((r) => (
            <div key={r.assignmentId} className="flex items-center justify-between border-b border-border px-5 py-3 last:border-0">
              <Link href={`/kpis/${r.kpiId}`} className="text-content-strong hover:text-accent-primary">{r.name}</Link>
              <span className="text-sm text-content-muted">{r.currentValue ?? '—'}{r.unit ? ` ${r.unit}` : ''}{r.targetValue !== null ? ` / ${r.targetValue}` : ''} {r.status && `· ${r.status}`}</span>
            </div>
          ))}
          {rows && rows.length === 0 && <p className="px-5 py-8 text-center text-content-muted" data-testid="user-kpis-empty">No KPIs assigned to this user.</p>}
        </div>
      </div>
    </main>
  );
}
