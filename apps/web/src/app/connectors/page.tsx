'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { AppShell } from '../../components/app-shell';
import { Skeleton } from '../../components/ui';
import {
  type Connector,
  type ConnectorType,
  createConnector,
  deleteConnector,
  listConnectors,
  runConnector,
} from '../../lib/integrations-client';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { RequireAnyPermission } from '../../components/auth/require-permission';
import { usePermissions } from '../../lib/use-permissions';

export default function ConnectorsPage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form (REST/GraphQL minimal)
  const [name, setName] = useState('');
  const [type, setType] = useState<ConnectorType>('REST');
  const [url, setUrl] = useState('');
  const [valuePath, setValuePath] = useState('');
  const [kpiId, setKpiId] = useState('');
  const [schedule, setSchedule] = useState('');

  const load = useCallback(async () => {
    try {
      setConnectors(await listConnectors());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, hasAny } = usePermissions();
  const allowed = ready && hasAny(['INTEGRATIONS_MANAGE', 'ORG_SETTINGS']);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void load();
  }, [load, router, allowed]);

  const create = async () => {
    if (!name.trim() || !url.trim() || !valuePath.trim() || !kpiId.trim()) return;
    try {
      await createConnector({ name: name.trim(), type, config: { url: url.trim(), valuePath: valuePath.trim(), kpiId: kpiId.trim() }, schedule: schedule.trim() || undefined });
      setName('');
      setUrl('');
      setValuePath('');
      setKpiId('');
      setSchedule('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create connector');
    }
  };

  const run = async (id: string) => {
    setBusy(id);
    try {
      await runConnector(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Run failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteConnector(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  return (
    <AppShell
      title="Connectors"
      crumbs={[{ label: 'Integrations', href: '/integrations' }, { label: 'Connectors' }]}
    >
      {/* FE-014: same permission the page's API enforces — no broken 403 screens. */}
      <RequireAnyPermission permissions={['INTEGRATIONS_MANAGE', 'ORG_SETTINGS']}>
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-content-strong">Data connectors</h1>
            <p className="mt-1 text-sm text-content-muted">Pull external data into a KPI on a schedule or on demand.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/integrations" className="text-content-muted hover:text-accent-primary">Integrations</Link>
            <Link href="/plugins" className="text-content-muted hover:text-accent-primary">Plugins</Link>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="connectors-error">{error}</p>}

        <PermissionGuard permission="ORG_SETTINGS">
        <div className="mt-5 rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-sm font-semibold text-content-strong">New connector</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input data-testid="connector-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <select data-testid="connector-type" value={type} onChange={(e) => setType(e.target.value as ConnectorType)} className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong">
              <option value="REST">REST</option>
              <option value="GRAPHQL">GraphQL</option>
            </select>
            <input data-testid="connector-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="connector-valuepath" value={valuePath} onChange={(e) => setValuePath(e.target.value)} placeholder="value JSON path (e.g. stargazers_count)" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="connector-kpiid" value={kpiId} onChange={(e) => setKpiId(e.target.value)} placeholder="KPI id" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="connector-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="cron (optional, e.g. 0 8 * * *)" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
          </div>
          <button type="button" data-testid="connector-create" onClick={create} className="mt-3 rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Create connector</button>
        </div>
        </PermissionGuard>

        {loading && (
          <div className="mt-6 space-y-2" data-testid="connectors-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && (
        <div className="mt-6 space-y-2" data-testid="connector-list">
          {connectors.map((c) => (
            <div key={c.id} data-testid={`connector-${c.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-4">
              <div>
                <Link href={`/connectors/${c.id}`} className="font-medium text-content-strong hover:text-accent-primary">{c.name}</Link>
                <p className="text-xs text-content-muted">
                  {c.type}{c.schedule ? ` · ${c.schedule}` : ''}
                  {c.lastRunStatus ? ` · last run ` : ''}
                  {c.lastRunStatus && <span data-testid={`connector-status-${c.id}`} className={c.lastRunStatus === 'SUCCEEDED' ? 'text-status-positive' : c.lastRunStatus === 'FAILED' ? 'text-status-critical' : 'text-status-warning'}>{c.lastRunStatus}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" data-testid={`connector-run-${c.id}`} onClick={() => run(c.id)} disabled={busy === c.id} className="rounded border border-border px-3 py-1 text-xs text-content-strong hover:border-accent-primary disabled:opacity-50">
                  {busy === c.id ? 'Running…' : 'Run now'}
                </button>
                <PermissionGuard permission="ORG_SETTINGS"><button type="button" aria-label="Delete" onClick={() => remove(c.id)} className="text-content-muted hover:text-status-critical">×</button></PermissionGuard>
              </div>
            </div>
          ))}
          {connectors.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="connectors-empty">No connectors yet.</p>}
        </div>
        )}
      </div>
      </RequireAnyPermission>
    </AppShell>
  );
}
