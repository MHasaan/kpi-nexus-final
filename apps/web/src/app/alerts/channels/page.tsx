'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createNotificationChannel,
  deleteNotificationChannel,
  getAccessToken,
  listNotificationChannels,
  testNotificationChannel,
  type NotificationChannel,
} from '../../../lib/api-client';

type Kind = NotificationChannel['kind'];

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<NotificationChannel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('EMAIL');
  const [recipients, setRecipients] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setChannels(await listNotificationChannels());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load channels');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  function buildConfig(): Record<string, unknown> {
    switch (kind) {
      case 'EMAIL':
        return {
          recipients: recipients
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        };
      case 'SLACK':
      case 'TEAMS':
        return { webhookUrl: webhookUrl.trim() };
      case 'WEBHOOK':
        return { url: webhookUrl.trim() };
      case 'SMS':
        return { fromNumber: fromNumber.trim() };
      default:
        return {};
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createNotificationChannel({ name: name.trim(), kind, config: buildConfig() });
      setName('');
      setRecipients('');
      setWebhookUrl('');
      setFromNumber('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }

  async function handleTest(id: string) {
    setBusyId(id);
    setTestMsg(null);
    try {
      await testNotificationChannel(id);
      setTestMsg('Test notification sent.');
      setTimeout(() => setTestMsg(null), 3000);
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : 'Test failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteNotificationChannel(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to delete channel');
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
            <Link href="/alerts" className="text-content-muted hover:text-content-strong">Alerts</Link>
            <Link href="/alerts/channels" className="font-medium text-content-strong">Channels</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="channels-heading">
          Notification channels
        </h1>

        {/* Create form */}
        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
          <h2 className="text-lg font-semibold text-content-strong">Add channel</h2>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4" data-testid="channel-create-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-content-default">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="channel-name-input" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-content-default">Kind</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} data-testid="channel-kind-select" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong">
                  <option value="EMAIL">Email</option>
                  <option value="SLACK">Slack</option>
                  <option value="TEAMS">Teams</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="SMS">SMS</option>
                  <option value="IN_APP">In-app</option>
                </select>
              </label>
            </div>
            {kind === 'EMAIL' && (
              <label className="block">
                <span className="text-sm font-medium text-content-default">Recipients <span className="text-content-muted">(comma-separated)</span></span>
                <input value={recipients} onChange={(e) => setRecipients(e.target.value)} data-testid="channel-recipients-input" placeholder="ops@acme.com, oncall@acme.com" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
            )}
            {(kind === 'SLACK' || kind === 'TEAMS' || kind === 'WEBHOOK') && (
              <label className="block">
                <span className="text-sm font-medium text-content-default">URL</span>
                <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} type="url" data-testid="channel-url-input" placeholder="https://…" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
            )}
            {kind === 'SMS' && (
              <label className="block">
                <span className="text-sm font-medium text-content-default">From number</span>
                <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} data-testid="channel-fromnumber-input" placeholder="+15551234567" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
              </label>
            )}
            {createError && <p role="alert" data-testid="channel-create-error" className="text-sm text-status-critical">{createError}</p>}
            <div>
              <button type="submit" disabled={creating} data-testid="channel-create-submit" className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50">
                {creating ? 'Adding…' : 'Add channel'}
              </button>
            </div>
          </form>
        </section>

        {testMsg && <div role="status" data-testid="channel-test-msg" className="mb-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-2 text-sm text-status-success">{testMsg}</div>}
        {loadError && <div role="alert" data-testid="channels-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        {channels && channels.length === 0 && (
          <div data-testid="channels-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">No channels yet.</div>
        )}
        {channels && channels.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="channels-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2">Active</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} data-testid={`channel-row-${c.id}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-content-strong">{c.name}</td>
                    <td className="px-4 py-3 text-content-muted">{c.kind}</td>
                    <td className="px-4 py-3">{c.isActive ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void handleTest(c.id)} disabled={busyId === c.id} data-testid={`channel-test-${c.id}`} className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50">Test</button>
                      <button type="button" onClick={() => void handleDelete(c.id)} disabled={busyId === c.id} data-testid={`channel-delete-${c.id}`} className="ml-2 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50">Delete</button>
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
