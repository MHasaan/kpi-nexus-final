'use client';

import { useTheme } from 'next-themes';
import { type FormEvent, useEffect, useState } from 'react';

import { LOCALES, LOCALE_LABELS, type Locale } from '../../i18n/dictionaries';
import { useTranslations } from '../../i18n/locale-provider';
import {
  ApiError,
  type NotificationSettings,
  meRequest,
  updateNotificationSettings,
} from '../../lib/api-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Segmented,
  Select,
} from '../ui';

const CHANNEL_KINDS = ['EMAIL', 'SLACK', 'TEAMS', 'SMS', 'WEBHOOK'] as const;

const DIGEST_OPTIONS = [
  { value: 'OFF', label: 'Off' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
] as const;

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function PreferencesTab() {
  return (
    <div className="grid gap-5">
      <NotificationsCard />
      <AppearanceCard />
      <LanguageCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications — mirrors /settings/notifications
// ---------------------------------------------------------------------------

function NotificationsCard() {
  const [digestMode, setDigestMode] = useState<'OFF' | 'DAILY' | 'WEEKLY'>('OFF');
  const [muteStart, setMuteStart] = useState('');
  const [muteEnd, setMuteEnd] = useState('');
  const [mutedKinds, setMutedKinds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { user } = await meRequest();
        const s: NotificationSettings = user.notificationSettings ?? {};
        if (s.digestMode) setDigestMode(s.digestMode);
        if (s.muteStart) setMuteStart(s.muteStart);
        if (s.muteEnd) setMuteEnd(s.muteEnd);
        if (s.mutedChannelKinds) setMutedKinds(s.mutedChannelKinds);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleKind(k: string) {
    setMutedKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
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
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="grid gap-6" data-testid="notif-form">
          <div className="grid gap-2">
            <Label id="digest-label">Email digest</Label>
            <Segmented
              aria-label="Email digest"
              options={DIGEST_OPTIONS}
              value={digestMode}
              onChange={setDigestMode}
              className="w-fit"
            />
            <p className="text-xs text-content-muted">
              How often batched updates are emailed to you. &ldquo;Off&rdquo; sends them
              immediately.
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-content-strong">Do-not-disturb hours</legend>
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
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-content-strong">Mute channels</legend>
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

          <div className="flex items-center gap-3">
            <Button type="submit" data-testid="notif-save" isLoading={saving} disabled={loading}>
              {saving ? 'Saving…' : 'Save notifications'}
            </Button>
            {saved && (
              <span role="status" data-testid="notif-saved" className="text-sm text-status-success">
                Saved.
              </span>
            )}
          </div>

          {error && (
            <p role="alert" data-testid="notif-error" className="text-sm text-status-critical">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Appearance — theme (hydration-safe)
// ---------------------------------------------------------------------------

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Until mounted, theme is unknown on the server/first render — default the
  // control to "system" so SSR and the first client render agree.
  const value = mounted ? (theme ?? 'system') : 'system';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label id="theme-label">Theme</Label>
        <div data-testid="theme-segmented" className="w-fit">
          <Segmented
            aria-label="Theme"
            options={THEME_OPTIONS}
            value={value as 'light' | 'dark' | 'system'}
            onChange={(v) => setTheme(v)}
          />
        </div>
        <p className="text-xs text-content-muted">
          &ldquo;System&rdquo; follows your operating system&apos;s light/dark setting.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Language — locale control. Keeps locale-select + language-heading testids
// and the translated label so the i18n e2e + RTL flip keep working.
// ---------------------------------------------------------------------------

function LanguageCard() {
  const { locale, setLocale, t } = useTranslations();
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="language-heading">{t('profile.language')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor="locale-select">{t('profile.language')}</Label>
        <Select
          id="locale-select"
          data-testid="locale-select"
          aria-label={t('profile.language')}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="max-w-xs"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>
        <p className="text-xs text-content-muted">{t('profile.languageHint')}</p>
      </CardContent>
    </Card>
  );
}
