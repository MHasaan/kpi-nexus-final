'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken, meRequest } from '../../lib/api-client';
import { type Objective, createObjective, listObjectives } from '../../lib/collab-client';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-content-muted',
  ACTIVE: 'text-accent-primary',
  AT_RISK: 'text-status-warning',
  ACHIEVED: 'text-status-positive',
  MISSED: 'text-status-critical',
  ARCHIVED: 'text-content-muted',
};

export default function OkrsPage() {
  const router = useRouter();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setObjectives(await listObjectives());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objectives');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    meRequest().then((r) => setUserId(r.user.id)).catch(() => undefined);
    void load();
  }, [load, router]);

  const create = async () => {
    if (!name.trim() || !userId) return;
    setCreating(true);
    try {
      const year = '2026';
      const obj = await createObjective({
        name: name.trim(),
        ownerUserId: userId,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        status: 'ACTIVE',
      });
      setName('');
      router.push(`/okrs/${obj.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create objective');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">OKRs</span>
          <Link href="/tasks" className="ml-auto text-sm text-content-muted hover:text-accent-primary">Tasks</Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Objectives</h1>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="okrs-error">{error}</p>}

        <div className="mt-4 flex gap-2">
          <input
            data-testid="objective-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New objective name"
            className="flex-1 rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong"
          />
          <button
            type="button"
            data-testid="create-objective"
            onClick={create}
            disabled={creating}
            className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create objective'}
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="objective-grid">
          {objectives.map((o) => (
            <Link
              key={o.id}
              href={`/okrs/${o.id}`}
              data-testid={`objective-${o.id}`}
              className="block rounded-lg border border-border bg-surface-1 p-5 hover:border-accent-primary"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-content-strong">{o.name}</h2>
                <span className={`text-xs font-semibold ${STATUS_COLOR[o.status] ?? 'text-content-muted'}`}>{o.status}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-bg">
                <div className="h-full bg-accent-primary" style={{ width: `${Math.round(o.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-content-muted">{Math.round(o.progress * 100)}% complete</p>
            </Link>
          ))}
          {objectives.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted sm:col-span-2" data-testid="okrs-empty">
              No objectives yet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
