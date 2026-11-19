'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  getMyOrganization,
  updateMyOrganization,
  type OrganizationSettings,
} from '../../../lib/api-client';
import {
  pluralize,
  useTerminology,
} from '../../../lib/terminology-context';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { useFormat } from '../../../lib/format-context';
import { currencyOptions, localeOptions } from '../../../lib/org-options';

/** Every timezone the browser knows, with UTC and the one in use always offered. */
const SELECT_CLASS =
  'mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30';

function timezoneChoices(current: string): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set(['UTC', ...known, current])].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

export default function OrganizationSettingsPage() {
  return (
    <OrganizationSettingsInner />
  );
}

function OrganizationSettingsInner() {
  const router = useRouter();
  const { refresh: refreshTerminology } = useTerminology();
  const format = useFormat();
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
  // Optional plural overrides — '' means "use the auto-pluralize heuristic".
  const [plurals, setPlurals] = useState({
    roleLabel: '',
    groupLabel: '',
    memberLabel: '',
    kpiLabel: '',
    dashboardLabel: '',
    scorecardLabel: '',
    objectiveLabel: '',
    taskLabel: '',
  });

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
        setPlurals({
          roleLabel: data.roleLabelPlural ?? '',
          groupLabel: data.groupLabelPlural ?? '',
          memberLabel: data.memberLabelPlural ?? '',
          kpiLabel: data.kpiLabelPlural ?? '',
          dashboardLabel: data.dashboardLabelPlural ?? '',
          scorecardLabel: data.scorecardLabelPlural ?? '',
          objectiveLabel: data.objectiveLabelPlural ?? '',
          taskLabel: data.taskLabelPlural ?? '',
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace(currentLoginRedirect());
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
        // Send '' as null so blank inputs clear the override and restore auto-pluralization.
        roleLabelPlural: plurals.roleLabel.trim() || null,
        groupLabelPlural: plurals.groupLabel.trim() || null,
        memberLabelPlural: plurals.memberLabel.trim() || null,
        kpiLabelPlural: plurals.kpiLabel.trim() || null,
        dashboardLabelPlural: plurals.dashboardLabel.trim() || null,
        scorecardLabelPlural: plurals.scorecardLabel.trim() || null,
        objectiveLabelPlural: plurals.objectiveLabel.trim() || null,
        taskLabelPlural: plurals.taskLabel.trim() || null,
      });
      setOrg(updated);
      await refreshTerminology();
      // Every page writes dates and numbers from these settings: make them read the new ones.
      await format.refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
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
                <label className="block">
                  <span className="text-sm font-medium text-content-default">Timezone</span>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} data-testid="org-timezone" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30">
                    {timezoneChoices(timezone).map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-content-muted">Times are shown in this timezone for everyone.</span>
                </label>
                {/* The same lists the setup wizard offers: these two used to be typed from memory ("PKR", "en-US"). */}
                <label className="block">
                  <span className="text-sm font-medium text-content-default">Currency</span>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="org-currency" className={SELECT_CLASS}>
                    {currencyOptions(currency).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {/* Owner's decision (2026-11-19): the currency is fixed on a KPI when it is created. */}
                  <span className="mt-1 block text-xs text-content-muted" data-testid="org-currency-help">
                    A new money KPI takes this as its unit. A KPI that already exists keeps its own: change it in the Unit box
                    under that KPI’s Edit.
                  </span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-content-default">Language and number format</span>
                  <select value={locale} onChange={(e) => setLocale(e.target.value)} data-testid="org-locale" className={SELECT_CLASS}>
                    {localeOptions(locale).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
              <legend className="px-2 text-sm font-semibold text-content-strong">
                Terminology
              </legend>
              <p className="mb-4 text-sm text-content-muted">
                Replace built-in labels with your team's preferred terms.
                Pluralization is automatic — set an optional plural override
                only when the heuristic gets it wrong.
              </p>
              <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
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
                ).map(([key, defaultValue]) => {
                  const singular = labels[key];
                  const override = plurals[key];
                  return (
                    <div key={key} className="space-y-2">
                      <Field
                        label={defaultValue}
                        value={singular}
                        onChange={(v) => setLabels({ ...labels, [key]: v })}
                        testId={`label-${key}`}
                      />
                      <Field
                        label="Plural (optional)"
                        value={override}
                        onChange={(v) => setPlurals({ ...plurals, [key]: v })}
                        placeholder={pluralize(singular)}
                        testId={`label-${key}-plural`}
                      />
                      <p
                        className="text-xs text-content-muted tabular-nums"
                        data-testid={`label-${key}-preview`}
                      >
                        1 {singular} · 2 {pluralize(singular, override)}
                      </p>
                    </div>
                  );
                })}
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
      </RequirePermission>
    </AppShell>
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
