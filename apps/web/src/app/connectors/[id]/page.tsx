'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { Skeleton } from '../../../components/ui';
import {
  type Connector,
  getConnector,
  listConnectorRuns,
  runConnector,
} from '../../../lib/integrations-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { RequireAnyPermission } from '../../../components/auth/require-permission';

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([getConnector(id), listConnectorRuns(id)]);
      setConnector(c);
      setRuns(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load connector');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
    <AppShell
      title={connector?.name ?? 'Connector'}
      crumbs={[
        { label: 'Integrations', href: '/integrations' },
        { label: 'Connectors', href: '/connectors' },
        { label: connector?.name ?? 'Connector' },
      ]}
    >
      {/* FE-014: same permission the page's API enforces — no broken 403 screens. */}
      <RequireAnyPermission permissions={['INTEGRATIONS_MANAGE', 'ORG_SETTINGS']}>
      <div className="mx-auto max-w-3xl">
        {error && <p className="mb-3 text-sm text-status-critical" role="alert" data-testid="connector-error">{error}</p>}
        {loading && (
          <div className="space-y-3" data-testid="connector-loading">
            <Skeleton className="h-8 w-1/2 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        )}
        {!loading && connector && (
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
      </RequireAnyPermission>
    </AppShell>
  );
}
