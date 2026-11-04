'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  getMyOrganization,
  updateMyOrganization,
  type OrganizationSettings,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Read the fiscal-year start month (1–12) out of the free-form fiscalCalendar JSON. */
function readStartMonth(cal: Record<string, unknown> | null): number {
  const raw = cal?.startMonth;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
}

export default function FiscalSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [startMonth, setStartMonth] = useState(1);
  const [weekStartsOn, setWeekStartsOn] = useState(0);
  const [dateFormat, setDateFormat] = useState('');
  const [numberFormat, setNumberFormat] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    getMyOrganization()
      .then((data) => {
        setOrg(data);
        setStartMonth(readStartMonth(data.fiscalCalendar));
        setWeekStartsOn(data.weekStartsOn ?? 0);
        setDateFormat(data.dateFormat ?? '');
        setNumberFormat(data.numberFormat ?? '');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace(currentLoginRedirect());
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load fiscal settings');
      });
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyOrganization({
        // Preserve any other keys already on fiscalCalendar.
        fiscalCalendar: { ...(org?.fiscalCalendar ?? {}), startMonth },
        weekStartsOn,
        dateFormat: dateFormat.trim() || undefined,
        numberFormat: numberFormat.trim() || undefined,
      });
      setOrg(updated);
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
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="fiscal-heading">
            Fiscal calendar
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Set when your fiscal year starts and how dates and numbers are formatted.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
              data-testid="fiscal-error"
            >
              {error}
            </div>
          )}

          {!org && !error && <p className="mt-6 text-sm text-content-muted">Loading…</p>}

          {org && (
            <form onSubmit={handleSave} className="mt-8 space-y-6" data-testid="fiscal-form">
              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Fiscal year</legend>
                <label className="block">
                  <span className="text-sm font-medium text-content-default">Fiscal year starts in</span>
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    data-testid="fiscal-start-month"
                    className="mt-1 block w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-content-default">Week starts on</span>
                  <select
                    value={weekStartsOn}
                    onChange={(e) => setWeekStartsOn(Number(e.target.value))}
                    data-testid="fiscal-week-starts-on"
                    className="mt-1 block w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Formats</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Date format"
                    value={dateFormat}
                    onChange={setDateFormat}
                    placeholder="MM/DD/YYYY"
                    testId="fiscal-date-format"
                  />
                  <Field
                    label="Number format"
                    value={numberFormat}
                    onChange={setNumberFormat}
                    placeholder="1,234.56"
                    testId="fiscal-number-format"
                  />
                </div>
              </fieldset>

              <PermissionGuard permission="ORG_SETTINGS">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    data-testid="fiscal-save"
                    className="rounded-md bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {saved && (
                    <span role="status" className="text-sm text-status-success" data-testid="fiscal-saved">
                      Saved.
                    </span>
                  )}
                </div>
              </PermissionGuard>
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
