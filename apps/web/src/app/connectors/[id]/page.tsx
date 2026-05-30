'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type Connector,
  getConnector,
  listConnectorRuns,
  runConnector,
} from '../../../lib/integrations-client';

interface Run {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
}

export default function ConnectorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [connector, setConnector] = useState<Connector | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([getConnector(id), listConnectorRuns(id)]);
      setConnector(c);
      setRuns(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load connector');
    }
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const run = async () => {
    setBusy(true);
    try {
      await runConnector(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/connectors" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Connector</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {error && <p className="mb-3 text-sm text-status-critical">{error}</p>}
        {connector && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-content-strong" data-testid="connector-heading">{connector.name}</h1>
              <button type="button" data-testid="connector-run" onClick={run} disabled={busy} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? 'Running…' : 'Run now'}
              </button>
            </div>
            <p className="mt-1 text-sm text-content-muted">{connector.type}{connector.schedule ? ` · ${connector.schedule}` : ' · manual'}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-1 p-3 text-xs text-content-muted">{JSON.stringify(connector.config, null, 2)}</pre>

            <h2 className="mt-6 text-sm font-semibold text-content-strong">Run history</h2>
            <div className="mt-2 space-y-1" data-testid="run-history">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border border-border bg-surface-1 px-3 py-2 text-sm">
                  <span className="text-content-muted">{new Date(r.createdAt).toLocaleString()} · {r.kind}</span>
                  <span className={r.status === 'SUCCEEDED' ? 'text-status-positive' : r.status === 'FAILED' ? 'text-status-critical' : 'text-status-warning'}>{r.status}</span>
                </div>
              ))}
              {runs.length === 0 && <p className="text-sm text-content-muted" data-testid="runs-empty">No runs yet.</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
