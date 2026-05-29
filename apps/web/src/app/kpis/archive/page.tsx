'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiError,
  getAccessToken,
  listArchivedKpis,
  purgeKpi,
  restoreKpi,
  type KpiSummary,
} from '../../../lib/api-client';

export default function ArchivePage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listArchivedKpis()
      .then(setKpis)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const onRestore = async (id: string) => {
    await restoreKpi(id).catch(() => undefined);
    load();
  };
  const onPurge = async (id: string) => {
    if (!window.confirm('Permanently delete this KPI and all its data? This cannot be undone.')) return;
    await purgeKpi(id).catch(() => undefined);
    load();
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Archive</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Archived KPIs</h1>
        <p className="mt-1 text-sm text-content-muted">Soft-deleted KPIs. Restore brings them back; purge deletes permanently.</p>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}

        <div className="mt-6 rounded-lg border border-border bg-surface-1" data-testid="archive-list">
          {(kpis ?? []).map((k) => (
            <div key={k.id} className="flex items-center justify-between border-b border-border px-5 py-3 last:border-0">
              <div>
                <span className="text-content-strong">{k.name}</span>
                <span className="ml-2 text-xs text-content-muted">{k.scope} · archived {k.deletedAt ? new Date(k.deletedAt).toLocaleDateString() : ''}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onRestore(k.id)} className="text-sm text-accent-primary hover:underline" data-testid={`restore-${k.id}`}>Restore</button>
                <button onClick={() => onPurge(k.id)} className="text-sm text-status-critical hover:underline" data-testid={`purge-${k.id}`}>Purge</button>
              </div>
            </div>
          ))}
          {kpis && kpis.length === 0 && <p className="px-5 py-8 text-center text-content-muted" data-testid="archive-empty">Nothing archived.</p>}
        </div>
      </div>
    </main>
  );
}
