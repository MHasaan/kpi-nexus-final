'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import {
  type Plugin,
  type PluginType,
  deletePlugin,
  installPlugin,
  listPlugins,
  setPluginEnabled,
} from '../../lib/integrations-client';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { RequirePermission } from '../../components/auth/require-permission';
import { usePermissions } from '../../lib/use-permissions';

export default function PluginsPage() {
  const router = useRouter();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<PluginType>('WIDGET');
  const [version, setVersion] = useState('1.0.0');
  const [entryUrl, setEntryUrl] = useState('');

  const load = useCallback(async () => {
    try {
      setPlugins(await listPlugins());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load plugins');
    }
  }, []);

  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void load();
  }, [load, router, allowed]);

  const install = async () => {
    if (!name.trim() || !entryUrl.trim()) return;
    try {
      await installPlugin({ name: name.trim(), type, version: version.trim() || '1.0.0', entryUrl: entryUrl.trim() });
      setName('');
      setEntryUrl('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Install failed');
    }
  };

  const toggle = async (p: Plugin) => {
    try {
      await setPluginEnabled(p.id, !p.isEnabled);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Toggle failed');
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePlugin(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  // FE-014: same permission the page's API enforces — no broken 403 screens.
  return (
    <RequirePermission permission="ORG_SETTINGS">
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Plugins</span>
          <Link href="/connectors" className="ml-auto text-sm text-content-muted hover:text-accent-primary">Connectors</Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Plugins</h1>
        <p className="mt-1 text-sm text-content-muted">Install custom widgets, templates, and formula functions. Sandboxed rendering arrives in a later release.</p>
        <div
          role="note"
          data-testid="plugins-warning"
          className="mt-3 rounded-lg border border-status-warning-bg bg-status-warning-bg px-4 py-3 text-sm text-status-warning"
        >
          Catalog only — sandboxed execution is post-v1; external entry URLs are unverified, so review each plugin before enabling.
        </div>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="plugins-error">{error}</p>}

        <div className="mt-5 rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-sm font-semibold text-content-strong">Install plugin</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input data-testid="plugin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <select data-testid="plugin-type" value={type} onChange={(e) => setType(e.target.value as PluginType)} className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong">
              <option value="WIDGET">Widget</option>
              <option value="TEMPLATE">Template</option>
              <option value="FORMULA_FN">Formula function</option>
              <option value="CONNECTOR">Connector</option>
            </select>
            <input data-testid="plugin-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="plugin-entryurl" value={entryUrl} onChange={(e) => setEntryUrl(e.target.value)} placeholder="https://cdn/entry.html" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
          </div>
          <button type="button" data-testid="plugin-install" onClick={install} className="mt-3 rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Install</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="plugin-list">
          {plugins.map((p) => (
            <div key={p.id} data-testid={`plugin-${p.id}`} className="rounded-lg border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-content-strong">{p.name}</span>
                <span className="text-xs text-content-muted">{p.type} · v{p.version}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" data-testid={`plugin-toggle-${p.id}`} onClick={() => toggle(p)} className={`rounded px-3 py-1 text-xs font-medium text-white ${p.isEnabled ? 'bg-status-positive' : 'bg-content-muted'}`}>
                  {p.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
                <button type="button" aria-label="Uninstall" onClick={() => remove(p.id)} className="ml-auto text-content-muted hover:text-status-critical">×</button>
              </div>
            </div>
          ))}
          {plugins.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted sm:col-span-2" data-testid="plugins-empty">No plugins installed.</p>}
        </div>
      </div>
    </main>
    </RequirePermission>
  );
}
