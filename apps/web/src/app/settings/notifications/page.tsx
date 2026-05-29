'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  meRequest,
  updateNotificationSettings,
  type NotificationSettings,
} from '../../../lib/api-client';

const CHANNEL_KINDS = ['EMAIL', 'SLACK', 'TEAMS', 'SMS', 'WEBHOOK'] as const;

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [digestMode, setDigestMode] = useState<'OFF' | 'DAILY' | 'WEEKLY'>('OFF');
  const [muteStart, setMuteStart] = useState('');
  const [muteEnd, setMuteEnd] = useState('');
  const [mutedKinds, setMutedKinds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const { user } = await meRequest();
        const s: NotificationSettings = user.notificationSettings ?? {};
        if (s.digestMode) setDigestMode(s.digestMode);
        if (s.muteStart) setMuteStart(s.muteStart);
        if (s.muteEnd) setMuteEnd(s.muteEnd);
        if (s.mutedChannelKinds) setMutedKinds(s.mutedChannelKinds);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load settings');
      }
    })();
  }, [router]);

  function toggleKind(k: string) {
    setMutedKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setLoadError(null);
    try {
      await updateNotificationSettings({
        digestMode,
        muteStart: muteStart || undefined,
        muteEnd: muteEnd || undefined,
        mutedChannelKinds: mutedKinds,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/settings/notifications" className="font-medium text-content-strong">Notifications</Link>
            <Link href="/settings/notifications/dlq" className="text-content-muted hover:text-content-strong">Delivery log</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="notif-settings-heading">
          Notification preferences
        </h1>

        {loadError && <div role="alert" data-testid="notif-settings-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        <form onSubmit={handleSave} className="grid gap-6" data-testid="notif-settings-form">
          <fieldset className="rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-semibold uppercase text-content-muted">Email digest</legend>
            <div className="flex flex-wrap gap-4">
              {(['OFF', 'DAILY', 'WEEKLY'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="digest" checked={digestMode === m} onChange={() => setDigestMode(m)} data-testid={`digest-${m}`} />
                  {m === 'OFF' ? 'Off (immediate)' : m === 'DAILY' ? 'Daily 8am' : 'Weekly Mon 8am'}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-semibold uppercase text-content-muted">Do-not-disturb hours</legend>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label>Start<input type="time" value={muteStart} onChange={(e) => setMuteStart(e.target.value)} data-testid="mute-start" className="ml-2 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
              <label>End<input type="time" value={muteEnd} onChange={(e) => setMuteEnd(e.target.value)} data-testid="mute-end" className="ml-2 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-semibold uppercase text-content-muted">Mute channels</legend>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={mutedKinds.includes(k)} onChange={() => toggleKind(k)} data-testid={`mute-kind-${k}`} />
                  {k}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} data-testid="notif-settings-save" className="rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
            {saved && <span role="status" data-testid="notif-settings-saved" className="text-sm text-status-success">Saved.</span>}
          </div>
        </form>
      </div>
    </main>
  );
}
