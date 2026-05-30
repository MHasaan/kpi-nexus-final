'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type KeyResult,
  type Objective,
  createKeyResult,
  getObjective,
  listKeyResults,
  syncObjectiveFromKpis,
  updateKeyResult,
} from '../../../lib/collab-client';

export default function ObjectiveDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [objective, setObjective] = useState<Objective | null>(null);
  const [krs, setKrs] = useState<KeyResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add-KR form
  const [krName, setKrName] = useState('');
  const [target, setTarget] = useState('');
  const [baseline, setBaseline] = useState('');

  const load = useCallback(async () => {
    try {
      const [obj, list] = await Promise.all([getObjective(id), listKeyResults(id)]);
      setObjective(obj);
      setKrs(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objective');
    }
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const addKr = async () => {
    if (!krName.trim() || !target) return;
    try {
      await createKeyResult(id, {
        name: krName.trim(),
        targetValue: Number(target),
        baselineValue: baseline ? Number(baseline) : undefined,
      });
      setKrName('');
      setTarget('');
      setBaseline('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add key result');
    }
  };

  const setCurrent = async (krId: string, value: number) => {
    try {
      await updateKeyResult(id, krId, { currentValue: value });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update key result');
    }
  };

  const sync = async () => {
    try {
      await syncObjectiveFromKpis(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sync failed');
    }
  };

  const pct = objective ? Math.round(objective.progress * 100) : 0;

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/okrs" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Objective</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {error && <p className="mb-3 text-sm text-status-critical" data-testid="okr-error">{error}</p>}
        {objective && (
          <>
            <h1 className="text-2xl font-semibold text-content-strong" data-testid="objective-heading">{objective.name}</h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-1">
                <div className="h-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-semibold text-content-strong" data-testid="objective-progress">{pct}%</span>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-content-strong">Key results</h2>
              <button type="button" data-testid="sync-kpis" onClick={sync} className="text-xs text-accent-primary hover:underline">
                Sync from linked KPIs
              </button>
            </div>

            <div className="mt-3 space-y-2" data-testid="kr-list">
              {krs.map((kr) => (
                <div key={kr.id} data-testid={`kr-${kr.id}`} className="rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-content-strong">{kr.name}</span>
                    <span className="text-sm font-semibold text-content-strong" data-testid="kr-progress">{Math.round(kr.progress * 100)}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-content-muted">
                    <span>{kr.baselineValue ?? '—'} → {kr.targetValue}</span>
                    <label className="ml-auto flex items-center gap-1">
                      Current:
                      <input
                        type="number"
                        data-testid={`kr-current-${kr.id}`}
                        defaultValue={kr.currentValue ?? ''}
                        onBlur={(e) => e.target.value !== '' && void setCurrent(kr.id, Number(e.target.value))}
                        className="w-24 rounded border border-border bg-surface-bg px-2 py-1 text-content-strong"
                      />
                    </label>
                  </div>
                </div>
              ))}
              {krs.length === 0 && <p className="text-sm text-content-muted" data-testid="kr-empty">No key results yet.</p>}
            </div>

            <div className="mt-5 rounded-lg border border-border bg-surface-1 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">Add key result</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <input data-testid="kr-name" value={krName} onChange={(e) => setKrName(e.target.value)} placeholder="Name" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
                <input data-testid="kr-baseline" value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="Baseline" type="number" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
                <input data-testid="kr-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" type="number" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
              </div>
              <button type="button" data-testid="add-kr" onClick={addKr} className="mt-3 rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Add key result
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
