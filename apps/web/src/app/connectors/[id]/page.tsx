'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ApiError, type KpiSummary, getAccessToken, listKpis } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { Button, Input, Label, Select, Skeleton } from '../../../components/ui';
import {
  type Connector,
  type ConnectorRun,
  getConnector,
  listConnectorRuns,
  runConnector,
  updateConnector,
} from '../../../lib/integrations-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { RequireAnyPermission } from '../../../components/auth/require-permission';
import { usePermissions } from '../../../lib/use-permissions';
import { useFormat } from '../../../lib/format-context';
import { optionalList } from '../../../lib/optional-list';

const RUN_STATUS_LABELS: Record<string, string> = { SUCCEEDED: 'Succeeded', FAILED: 'Failed', PARTIAL: 'Partly failed' };

/** "3 values", "1 value", "no values". */
const valuesText = (n: number) => (n === 0 ? 'no values' : n === 1 ? '1 value' : `${n} values`);

/** What a run did, in a sentence. */
function runSentence(r: { status: string; rowCount: number; error?: string }): string {
  if (r.status === 'FAILED') return `The run failed${r.error ? `: ${r.error}` : '.'}`;
  if (r.status === 'PARTIAL') return `The run recorded ${valuesText(r.rowCount)}; some were refused${r.error ? `: ${r.error}` : '.'}`;
  return r.rowCount === 0 ? 'The run finished and found nothing to record.' : `The run recorded ${valuesText(r.rowCount)}.`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export default function ConnectorDetailPage() {
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [connector, setConnector] = useState<Connector | null>(null);
  const [runs, setRuns] = useState<ConnectorRun[]>([]);
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [lastRun, setLastRun] = useState<{ status: string; rowCount: number; error?: string } | null>(null);
  // Editing: the fields a person set when making it. The rest of `config` is kept as it is.
  const [edit, setEdit] = useState<{ name: string; url: string; valuePath: string; kpiId: string; schedule: string; isActive: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, r, k] = await Promise.all([getConnector(id), listConnectorRuns(id), optionalList(listKpis(), 'KPIs', setError)]);
      setConnector(c);
      setRuns(r);
      setKpis(k);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load connector');
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  const run = async () => {
    setBusy(true);
    setLastRun(null);
    try {
      setLastRun(await runConnector(id));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    if (!connector) return;
    setEditError(null);
    setEdit({
      name: connector.name,
      url: str(connector.config.url),
      valuePath: str(connector.config.valuePath),
      kpiId: str(connector.config.kpiId),
      schedule: connector.schedule ?? '',
      isActive: connector.isActive,
    });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!connector || !edit) return;
    if (!edit.name.trim() || !edit.url.trim() || !edit.valuePath.trim() || !edit.kpiId) {
      setEditError('A connector needs a name, an address, a value path and a KPI.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await updateConnector(id, {
        name: edit.name.trim(),
        config: { ...connector.config, url: edit.url.trim(), valuePath: edit.valuePath.trim(), kpiId: edit.kpiId },
        schedule: edit.schedule.trim() || null,
        isActive: edit.isActive,
      });
      setEdit(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save the connector');
    } finally {
      setSaving(false);
    }
  };

  const kpiName = (kid: string) => kpis.find((k) => k.id === kid)?.name;

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
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold text-content-strong" data-testid="connector-heading">{connector.name}</h1>
              <div className="flex gap-2">
                <button type="button" data-testid="connector-edit" onClick={() => (edit ? setEdit(null) : startEdit())} className="rounded border border-border px-4 py-1.5 text-sm font-medium text-content-strong hover:border-accent-primary">
                  {edit ? 'Close' : 'Edit'}
                </button>
                <button type="button" data-testid="connector-run" onClick={run} disabled={busy} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {busy ? 'Running…' : 'Run now'}
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-content-muted" data-testid="connector-summary">
              {connector.isActive ? '' : 'Paused · '}
              {connector.type} · {connector.schedule ? `runs on the schedule ${connector.schedule}` : 'runs only when asked'} · reads{' '}
              <code className="rounded bg-surface-2 px-1 font-mono text-xs">{str(connector.config.valuePath) || '—'}</code> into{' '}
              <span className="font-medium text-content-strong">{kpiName(str(connector.config.kpiId)) ?? 'a KPI'}</span>
            </p>

            {lastRun && (
              <p
                role={lastRun.status === 'SUCCEEDED' ? 'status' : 'alert'}
                data-testid="connector-run-result"
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${lastRun.status === 'SUCCEEDED' ? 'border-border bg-surface-1 text-content-strong' : 'border-status-critical/40 bg-status-critical-bg text-status-critical'}`}
              >
                {runSentence(lastRun)}
              </p>
            )}

            {edit && (
              <form onSubmit={(e) => void saveEdit(e)} data-testid="connector-edit-form" className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ce-name">Name</Label>
                  <Input id="ce-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={saving} maxLength={200} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ce-url">Address</Label>
                  <Input id="ce-url" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} disabled={saving} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ce-path">Value path</Label>
                  <Input id="ce-path" value={edit.valuePath} onChange={(e) => setEdit({ ...edit, valuePath: e.target.value })} disabled={saving} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ce-kpi">KPI</Label>
                  <Select id="ce-kpi" value={edit.kpiId} onChange={(e) => setEdit({ ...edit, kpiId: e.target.value })} disabled={saving}>
                    {/* A KPI the reader cannot see keeps its place, unnamed, so saving does not drop it. */}
                    {edit.kpiId && !kpiName(edit.kpiId) && <option value={edit.kpiId}>(the KPI it records on now)</option>}
                    {kpis.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ce-schedule">Schedule</Label>
                  <Input id="ce-schedule" value={edit.schedule} onChange={(e) => setEdit({ ...edit, schedule: e.target.value })} disabled={saving} placeholder="empty = only when asked; e.g. 0 8 * * *" />
                </div>
                <label className="flex items-center gap-2 self-end text-sm text-content-strong">
                  <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} disabled={saving} />
                  Active
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" size="sm" isLoading={saving}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(null)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
                {editError && (
                  <p role="alert" data-testid="connector-edit-error" className="text-sm text-status-critical sm:col-span-2">
                    {editError}
                  </p>
                )}
              </form>
            )}

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-content-muted">Full configuration</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-1 p-3 text-xs text-content-muted">{JSON.stringify(connector.config, null, 2)}</pre>
            </details>

            <h2 className="mt-6 text-sm font-semibold text-content-strong">Run history</h2>
            <div className="mt-2 space-y-1" data-testid="run-history">
              {runs.map((r) => (
                <div key={r.id} data-testid={`run-row-${r.id}`} className="rounded border border-border bg-surface-1 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-content-muted">{fmt.dateTime(r.createdAt)}</span>
                    <span className="flex items-center gap-3">
                      {typeof r.source?.rowCount === 'number' && <span className="tabular-nums text-content-muted">{valuesText(r.source.rowCount)}</span>}
                      <span className={r.status === 'SUCCEEDED' ? 'text-status-positive' : r.status === 'FAILED' ? 'text-status-critical' : 'text-status-warning'}>
                        {RUN_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </span>
                  </div>
                  {r.errorLog && (
                    <p className="mt-1 break-words text-xs text-status-critical" data-testid="run-error">
                      {r.errorLog}
                    </p>
                  )}
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
