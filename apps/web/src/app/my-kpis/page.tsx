'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiError,
  getAccessToken,
  listMyKpis,
  recordMyKpiData,
  type MyKpiRow,
} from '../../lib/api-client';

const STATUS_COLOR: Record<string, string> = {
  exceeded: 'bg-status-positive', on_track: 'bg-status-positive', at_risk: 'bg-status-warning', behind: 'bg-status-critical',
};

export default function MyKpisPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MyKpiRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyKpis().then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);
  useEffect(() => {
    if (!getAccessToken()) { router.replace('/login'); return; }
    load();
  }, [load, router]);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">My KPIs</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">My KPIs</h1>
        <p className="mt-1 text-sm text-content-muted">Your personally-assigned KPIs. Record a new value inline.</p>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}
        <div className="mt-6 space-y-3" data-testid="my-kpis-list">
          {(rows ?? []).map((r) => <MyKpiCard key={r.assignmentId} row={r} onRecorded={load} />)}
          {rows && rows.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="my-kpis-empty">No KPIs assigned to you yet.</p>}
        </div>
      </div>
    </main>
  );
}

function MyKpiCard({ row, onRecorded }: { row: MyKpiRow; onRecorded: () => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const now = new Date().toISOString();
    try {
      await recordMyKpiData(row.assignmentId, Number(value), now, now);
      setValue('');
      onRecorded();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to record');
    }
  };
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Link href={`/kpis/${row.kpiId}`} className="font-medium text-content-strong hover:text-accent-primary">{row.name}</Link>
        {row.status && <span className="flex items-center gap-1.5 text-xs text-content-muted"><span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[row.status] ?? 'bg-content-muted'}`} />{row.status}</span>}
      </div>
      <p className="mt-1 text-sm text-content-muted">Current: <span className="text-content-strong">{row.currentValue ?? '—'}{row.unit ? ` ${row.unit}` : ''}</span>{row.targetValue !== null && ` · Target: ${row.targetValue}`}</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="any" required placeholder="new value"
          className="flex-1 rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-strong" data-testid={`mykpi-value-${row.kpiId}`} />
        <button className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white" data-testid={`mykpi-record-${row.kpiId}`}>Record</button>
      </form>
      {err && <p className="mt-1 text-xs text-status-critical">{err}</p>}
    </div>
  );
}
