'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createWebhook,
  deleteWebhook,
  getAccessToken,
  listWebhooks,
  rotateWebhookSecret,
  setWebhookActive,
  testWebhook,
  type WebhookSubscription,
} from '../../../lib/api-client';

const EVENT_CHOICES = ['alert_triggered', 'alert_escalated', 'data_point_added'] as const;

export default function WebhooksPage() {
  const router = useRouter();
  const [hooks, setHooks] = useState<WebhookSubscription[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['alert_triggered']);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setHooks(await listWebhooks());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load webhooks');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  function toggleEvent(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (events.length === 0) {
      setCreateError('Select at least one event.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createWebhook({ name: name.trim(), url: url.trim(), events });
      setSecret(res.secret);
      setName('');
      setUrl('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setStatusMsg(null);
    try {
      await fn();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Action failed');
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
            <Link href="/settings/api-keys" className="text-content-muted hover:text-content-strong">API keys</Link>
            <Link href="/settings/webhooks" className="font-medium text-content-strong">Webhooks</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="webhooks-heading">Webhooks</h1>

        {secret && (
          <div data-testid="webhook-secret" className="mb-6 rounded-lg border border-status-warning/40 bg-status-warning/10 p-4">
            <p className="text-sm font-medium text-content-strong">Signing secret — copy it now, it won&apos;t be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-surface-bg px-3 py-2 text-xs text-content-strong">{secret}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(secret)} className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs hover:bg-surface-2">Copy</button>
              <button type="button" onClick={() => setSecret(null)} data-testid="webhook-secret-dismiss" className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs hover:bg-surface-2">Dismiss</button>
            </div>
          </div>
        )}

        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
          <h2 className="text-lg font-semibold text-content-strong">Add webhook</h2>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4" data-testid="webhook-create-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-content-default">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="webhook-name-input" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-content-default">URL</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required data-testid="webhook-url-input" placeholder="https://…" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
            </div>
            <div>
              <span className="text-sm font-medium text-content-default">Events</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {EVENT_CHOICES.map((e) => (
                  <label key={e} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} data-testid={`webhook-event-${e}`} />
                    {e}
                  </label>
                ))}
              </div>
            </div>
            {createError && <p role="alert" data-testid="webhook-create-error" className="text-sm text-status-critical">{createError}</p>}
            <div>
              <button type="submit" disabled={creating} data-testid="webhook-create-submit" className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50">
                {creating ? 'Adding…' : 'Add webhook'}
              </button>
            </div>
          </form>
        </section>

        {statusMsg && <div role="status" data-testid="webhook-status-msg" className="mb-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-2 text-sm text-status-success">{statusMsg}</div>}
        {loadError && <div role="alert" data-testid="webhooks-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        {hooks && hooks.length === 0 && <div data-testid="webhooks-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">No webhooks yet.</div>}
        {hooks && hooks.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="webhooks-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Events</th><th className="px-4 py-2">Active</th><th className="px-4 py-2">Last status</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id} data-testid={`webhook-row-${h.id}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-content-strong">{h.name}<div className="text-xs text-content-muted">{h.url}</div></td>
                    <td className="px-4 py-3 text-xs text-content-muted">{h.events.join(', ')}</td>
                    <td className="px-4 py-3">{h.isActive ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-content-muted">{h.lastStatus ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void withBusy(h.id, async () => { await testWebhook(h.id); setStatusMsg('Test delivery queued.'); })} disabled={busyId === h.id} data-testid={`webhook-test-${h.id}`} className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">Test</button>
                      <button type="button" onClick={() => void withBusy(h.id, async () => { const r = await rotateWebhookSecret(h.id); setSecret(r.secret); })} disabled={busyId === h.id} data-testid={`webhook-rotate-${h.id}`} className="ml-2 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">Rotate</button>
                      <button type="button" onClick={() => void withBusy(h.id, async () => { await setWebhookActive(h.id, !h.isActive); await refresh(); })} disabled={busyId === h.id} data-testid={`webhook-toggle-${h.id}`} className="ml-2 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">{h.isActive ? 'Disable' : 'Enable'}</button>
                      <button type="button" onClick={() => void withBusy(h.id, async () => { await deleteWebhook(h.id); await refresh(); })} disabled={busyId === h.id} data-testid={`webhook-delete-${h.id}`} className="ml-2 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50">Delete</button>
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
