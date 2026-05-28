'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createScheduledReport,
  getAccessToken,
  listDashboards,
  listKpis,
  type Dashboard,
  type KpiSummary,
  type ReportFormat,
} from '../../../lib/api-client';

const CRON_PRESETS = [
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Weekly Mon 9am', value: '0 9 * * 1' },
  { label: 'Monthly 1st 9am', value: '0 9 1 * *' },
  { label: 'Custom', value: 'custom' },
] as const;

export default function NewReportPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [cronPreset, setCronPreset] = useState<string>('0 8 * * *');
  const [customCron, setCustomCron] = useState('');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedKpiIds, setSelectedKpiIds] = useState<string[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');
  const [recipients, setRecipients] = useState<string[]>(['']);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router]);

  async function load() {
    try {
      const [k, d] = await Promise.all([listKpis(), listDashboards()]);
      setKpis(k);
      setDashboards(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
      }
    }
  }

  function toggleKpi(id: string) {
    setSelectedKpiIds((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id],
    );
  }

  function updateRecipient(index: number, value: string) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? value : r)));
  }

  function addRecipient() {
    setRecipients((prev) => [...prev, '']);
  }

  function removeRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const cron = cronPreset === 'custom' ? customCron.trim() : cronPreset;
    const validRecipients = recipients.map((r) => r.trim()).filter(Boolean);

    try {
      await createScheduledReport({
        name: name.trim(),
        cron,
        format,
        recipients: validRecipients,
        dashboardId: selectedDashboardId || undefined,
        kpiIds: selectedKpiIds.length > 0 ? selectedKpiIds : undefined,
        description: description.trim() || undefined,
      });
      router.push('/reports');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to create report');
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveCron = cronPreset === 'custom' ? customCron : cronPreset;

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-content-strong hover:text-accent-primary"
          >
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/reports" className="text-content-muted hover:text-content-strong">
              Reports
            </Link>
            <span className="text-content-muted">/</span>
            <span className="font-medium text-content-strong">New report</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong">New Scheduled Report</h1>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          {/* Name */}
          <label className="block">
            <span className="text-sm font-medium text-content-default">Report name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              data-testid="report-name-input"
              placeholder="Monthly Revenue Report"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
            />
          </label>

          {/* Description */}
          <label className="block">
            <span className="text-sm font-medium text-content-default">
              Description <span className="text-content-muted">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={2}
              data-testid="report-description-input"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
            />
          </label>

          {/* Schedule */}
          <fieldset className="rounded-lg border border-border bg-surface-1 p-4">
            <legend className="px-1 text-sm font-medium text-content-default">Schedule</legend>
            <div className="mt-2 space-y-2">
              {CRON_PRESETS.map((preset) => (
                <label key={preset.value} className="flex items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="cronPreset"
                    value={preset.value}
                    checked={cronPreset === preset.value}
                    onChange={() => setCronPreset(preset.value)}
                    disabled={submitting}
                    className="text-accent-primary focus:ring-accent-primary"
                  />
                  <span className="text-content-default">{preset.label}</span>
                  {preset.value !== 'custom' && (
                    <span className="font-mono text-xs text-content-muted">{preset.value}</span>
                  )}
                </label>
              ))}
              {cronPreset === 'custom' && (
                <input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  disabled={submitting}
                  placeholder="0 9 * * 1-5"
                  data-testid="report-cron-custom-input"
                  className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 font-mono text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                />
              )}
              {effectiveCron && (
                <p className="mt-1 font-mono text-xs text-content-muted">
                  Cron: <span className="text-content-default">{effectiveCron}</span>
                </p>
              )}
            </div>
          </fieldset>

          {/* Format */}
          <label className="block">
            <span className="text-sm font-medium text-content-default">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              disabled={submitting}
              data-testid="report-format-select"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
            >
              <option value="PDF">PDF</option>
              <option value="EXCEL">Excel</option>
              <option value="CSV">CSV</option>
            </select>
          </label>

          {/* Dashboard select */}
          <label className="block">
            <span className="text-sm font-medium text-content-default">
              Dashboard <span className="text-content-muted">(optional)</span>
            </span>
            <select
              value={selectedDashboardId}
              onChange={(e) => setSelectedDashboardId(e.target.value)}
              disabled={submitting}
              data-testid="report-dashboard-select"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
            >
              <option value="">No specific dashboard</option>
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          {/* KPI multi-select */}
          {kpis.length > 0 && (
            <fieldset className="rounded-lg border border-border bg-surface-1 p-4">
              <legend className="px-1 text-sm font-medium text-content-default">
                KPIs <span className="font-normal text-content-muted">(optional — leave empty for all)</span>
              </legend>
              <ul className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2" data-testid="report-kpi-list">
                {kpis.map((kpi) => (
                  <li key={kpi.id}>
                    <label className="flex items-center gap-2 rounded border border-border bg-surface-bg px-2 py-1.5 text-sm cursor-pointer hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={selectedKpiIds.includes(kpi.id)}
                        onChange={() => toggleKpi(kpi.id)}
                        disabled={submitting}
                        data-testid={`report-kpi-checkbox-${kpi.id}`}
                        className="rounded border-border text-accent-primary focus:ring-accent-primary"
                      />
                      <span className="truncate text-content-default">{kpi.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {/* Recipients */}
          <fieldset className="rounded-lg border border-border bg-surface-1 p-4">
            <legend className="px-1 text-sm font-medium text-content-default">Recipients</legend>
            <div className="mt-2 space-y-2">
              {recipients.map((email, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateRecipient(index, e.target.value)}
                    disabled={submitting}
                    placeholder="user@example.com"
                    data-testid={`report-recipient-${index}`}
                    className="flex-1 rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                  />
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRecipient(index)}
                      disabled={submitting}
                      className="rounded-md border border-status-critical/40 px-2 py-1.5 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addRecipient}
                disabled={submitting}
                data-testid="report-add-recipient"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
              >
                + Add recipient
              </button>
            </div>
          </fieldset>

          {submitError && (
            <div
              role="alert"
              data-testid="report-create-error"
              className="rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
            >
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              data-testid="report-create-submit"
              className="inline-flex h-10 items-center rounded-md bg-accent-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create report'}
            </button>
            <Link
              href="/reports"
              className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm text-content-default hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
