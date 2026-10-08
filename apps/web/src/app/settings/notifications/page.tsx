'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
} from '../../../components/ui';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  meRequest,
  updateNotificationSettings,
  type NotificationSettings,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

const CHANNEL_KINDS = ['EMAIL', 'SLACK', 'TEAMS', 'SMS', 'WEBHOOK'] as const;

const DIGEST_OPTIONS: ReadonlyArray<{ value: 'OFF' | 'DAILY' | 'WEEKLY'; label: string }> = [
  { value: 'OFF', label: 'Off (immediate)' },
  { value: 'DAILY', label: 'Daily 8am' },
  { value: 'WEEKLY', label: 'Weekly Mon 8am' },
];

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
      router.replace(currentLoginRedirect());
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
          router.replace(currentLoginRedirect());
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
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Notification preferences"
          subtitle="Control digest cadence, quiet hours, and which channels are muted for you."
          actions={
            <Link
              href="/settings/notifications/dlq"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Delivery log
            </Link>
          }
        />
        <h1 data-testid="notif-settings-heading" className="sr-only">
          Notification preferences
        </h1>

        {loadError && (
          <div
            role="alert"
            data-testid="notif-settings-error"
            className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-5 grid gap-5" data-testid="notif-settings-form">
          <Card>
            <CardHeader>
              <CardTitle>Email digest</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset>
                <legend className="sr-only">Email digest</legend>
                <div className="flex flex-wrap gap-4">
                  {DIGEST_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-content">
                      <input
                        type="radio"
                        name="digest"
                        checked={digestMode === opt.value}
                        onChange={() => setDigestMode(opt.value)}
                        data-testid={`digest-${opt.value}`}
                        className="accent-[hsl(var(--accent-primary))]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Do-not-disturb hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="mute-start">Start</Label>
                  <Input
                    id="mute-start"
                    type="time"
                    value={muteStart}
                    onChange={(e) => setMuteStart(e.target.value)}
                    data-testid="mute-start"
                    className="w-36"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mute-end">End</Label>
                  <Input
                    id="mute-end"
                    type="time"
                    value={muteEnd}
                    onChange={(e) => setMuteEnd(e.target.value)}
                    data-testid="mute-end"
                    className="w-36"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mute channels</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset>
                <legend className="sr-only">Mute channels</legend>
                <div className="flex flex-wrap gap-4">
                  {CHANNEL_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-content">
                      <input
                        type="checkbox"
                        checked={mutedKinds.includes(k)}
                        onChange={() => toggleKind(k)}
                        data-testid={`mute-kind-${k}`}
                        className="accent-[hsl(var(--accent-primary))]"
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" isLoading={saving} data-testid="notif-settings-save">
              {saving ? 'Saving…' : 'Save preferences'}
            </Button>
            {saved && (
              <span role="status" data-testid="notif-settings-saved" className="text-sm text-status-success">
                Saved.
              </span>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
