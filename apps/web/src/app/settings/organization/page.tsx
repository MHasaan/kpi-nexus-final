'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getMyOrganization,
  logoutRequest,
  updateMyOrganization,
  type OrganizationSettings,
} from '../../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';

export default function OrganizationSettingsPage() {
  return (
    <TerminologyProvider>
      <OrganizationSettingsInner />
    </TerminologyProvider>
  );
}

function OrganizationSettingsInner() {
  const router = useRouter();
  const { terminology, refresh: refreshTerminology } = useTerminology();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit-form local state — mirrors org but lets the user type freely
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('USD');
  const [locale, setLocale] = useState('en-US');
  const [labels, setLabels] = useState({
    roleLabel: 'Role',
    groupLabel: 'Team',
    memberLabel: 'Member',
    kpiLabel: 'KPI',
    dashboardLabel: 'Dashboard',
    scorecardLabel: 'Scorecard',
    objectiveLabel: 'Objective',
    taskLabel: 'Task',
  });

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getMyOrganization()
      .then((data) => {
        setOrg(data);
        setName(data.name);
        setTimezone(data.timezone);
        setCurrency(data.currency);
        setLocale(data.locale);
        setLabels({
          roleLabel: data.roleLabel,
          groupLabel: data.groupLabel,
          memberLabel: data.memberLabel,
          kpiLabel: data.kpiLabel,
          dashboardLabel: data.dashboardLabel,
          scorecardLabel: data.scorecardLabel,
          objectiveLabel: data.objectiveLabel,
          taskLabel: data.taskLabel,
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load settings');
      });
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyOrganization({
        name,
        timezone,
        currency,
        locale,
        ...labels,
      });
      setOrg(updated);
      await refreshTerminology();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logoutRequest();
    router.push('/login');
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link
                href="/roles"
                className="text-content-muted hover:text-content-strong"
                data-testid="nav-roles"
              >
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link
                href="/settings/organization"
                className="font-medium text-accent-primary"
              >
                Settings
              </Link>
            </nav>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-content-strong">
          Organization settings
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Customize the names your team sees throughout the app.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {!org && !error && (
          <p className="mt-6 text-sm text-content-muted">Loading…</p>
        )}

        {org && (
          <form onSubmit={handleSave} className="mt-8 space-y-6">
            <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
              <legend className="px-2 text-sm font-semibold text-content-strong">
                Identity
              </legend>
              <Field label="Organization name" value={name} onChange={setName} required />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Timezone" value={timezone} onChange={setTimezone} />
                <Field
                  label="Currency"
                  value={currency}
                  onChange={(v) => setCurrency(v.toUpperCase())}
                  maxLength={3}
                />
                <Field label="Locale" value={locale} onChange={setLocale} />
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
              <legend className="px-2 text-sm font-semibold text-content-strong">
                Terminology
              </legend>
              <p className="mb-4 text-sm text-content-muted">
                Replace built-in labels with your team's preferred terms.
                Pluralization is automatic.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['roleLabel', 'Role'],
                    ['groupLabel', 'Team'],
                    ['memberLabel', 'Member'],
                    ['kpiLabel', 'KPI'],
                    ['dashboardLabel', 'Dashboard'],
                    ['scorecardLabel', 'Scorecard'],
                    ['objectiveLabel', 'Objective'],
                    ['taskLabel', 'Task'],
                  ] as const
                ).map(([key, defaultValue]) => (
                  <Field
                    key={key}
                    label={defaultValue}
                    value={labels[key]}
                    onChange={(v) => setLabels({ ...labels, [key]: v })}
                    testId={`label-${key}`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved && (
                <span
                  role="status"
                  className="text-sm text-status-success"
                  data-testid="settings-saved"
                >
                  Saved.
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  testId,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      />
    </label>
  );
}
