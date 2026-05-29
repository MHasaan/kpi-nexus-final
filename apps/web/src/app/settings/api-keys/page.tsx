'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createApiKey,
  getAccessToken,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
} from '../../../lib/api-client';

// Curated scope choices (subset of the 18 canonical permissions).
const SCOPE_CHOICES = [
  'KPI_VIEW',
  'KPI_DATA_ENTRY',
  'DASHBOARD_VIEW',
  'REPORTS_VIEW',
  'ALERTS_VIEW',
  'ANALYTICS_VIEW',
] as const;

export default function ApiKeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['KPI_VIEW']);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [mintedPlaintext, setMintedPlaintext] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setKeys(await listApiKeys());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load API keys');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scopes.length === 0) {
      setCreateError('Select at least one scope.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { plaintext } = await createApiKey({ name: name.trim(), scopes });
      setMintedPlaintext(plaintext);
      setName('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    try {
      await revokeApiKey(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to revoke');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/settings/api-keys" className="font-medium text-content-strong">API keys</Link>
            <Link href="/settings/webhooks" className="text-content-muted hover:text-content-strong">Webhooks</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="apikeys-heading">API keys</h1>

        {/* One-time plaintext banner */}
        {mintedPlaintext && (
          <div data-testid="apikey-plaintext" className="mb-6 rounded-lg border border-status-warning/40 bg-status-warning/10 p-4">
            <p className="text-sm font-medium text-content-strong">Copy your API key now — it won&apos;t be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-surface-bg px-3 py-2 text-xs text-content-strong">{mintedPlaintext}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(mintedPlaintext)} className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs hover:bg-surface-2">Copy</button>
              <button type="button" onClick={() => setMintedPlaintext(null)} data-testid="apikey-plaintext-dismiss" className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs hover:bg-surface-2">Dismiss</button>
            </div>
          </div>
        )}

        {/* Mint form */}
        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
          <h2 className="text-lg font-semibold text-content-strong">Create API key</h2>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4" data-testid="apikey-create-form">
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="apikey-name-input" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            </label>
            <div>
              <span className="text-sm font-medium text-content-default">Scopes</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {SCOPE_CHOICES.map((s) => (
                  <label key={s} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} data-testid={`apikey-scope-${s}`} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            {createError && <p role="alert" data-testid="apikey-create-error" className="text-sm text-status-critical">{createError}</p>}
            <div>
              <button type="submit" disabled={creating} data-testid="apikey-create-submit" className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </form>
        </section>

        {loadError && <div role="alert" data-testid="apikeys-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        {keys && keys.length === 0 && <div data-testid="apikeys-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">No API keys yet.</div>}
        {keys && keys.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="apikeys-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Prefix</th><th className="px-4 py-2">Scopes</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} data-testid={`apikey-row-${k.id}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-content-strong">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-content-muted">{k.keyPrefix}…</td>
                    <td className="px-4 py-3 text-xs text-content-muted">{k.scopes.join(', ')}</td>
                    <td className="px-4 py-3">{k.revokedAt ? 'Revoked' : 'Active'}</td>
                    <td className="px-4 py-3 text-right">
                      {!k.revokedAt && (
                        <button type="button" onClick={() => void handleRevoke(k.id)} disabled={busyId === k.id} data-testid={`apikey-revoke-${k.id}`} className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50">Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
