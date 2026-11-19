'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';

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
  type ScheduledReport,
  updateScheduledReport,
} from '../../lib/api-client';
import { AppShell } from '../app-shell';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '../ui';
import { cronProblem, recipientsProblem } from '../../lib/form-checks';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { useFormat } from '../../lib/format-context';
import { scheduleInWords } from '../../lib/report-schedule';


const CRON_PRESETS = [
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Weekly Mon 9am', value: '0 9 * * 1' },
  { label: 'Monthly 1st 9am', value: '0 9 1 * *' },
  { label: 'Custom', value: 'custom' },
] as const;

/**
 * The form for a scheduled report: a new one, or — given `report` — one being
 * changed. A report used to be changeable only by deleting it, with its run
 * history, and making it again.
 */
export function ReportForm({ report }: { report?: ScheduledReport }) {
  const router = useRouter();
  const fmt = useFormat();
  // A saved schedule that is not one of the three offered is kept as it is, under Custom.
  const savedIsPreset = report ? CRON_PRESETS.some((p) => p.value === report.cron) : true;
  const [name, setName] = useState(report?.name ?? '');
  const [cronPreset, setCronPreset] = useState<string>(report ? (savedIsPreset ? report.cron : 'custom') : '0 8 * * *');
  const [customCron, setCustomCron] = useState(report && !savedIsPreset ? report.cron : '');
  const [format, setFormat] = useState<ReportFormat>(report?.format ?? 'PDF');
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedKpiIds, setSelectedKpiIds] = useState<string[]>(report?.kpiIds ?? []);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>(report?.dashboardId ?? '');
  const [recipients, setRecipients] = useState<string[]>(report && report.recipients.length > 0 ? report.recipients : ['']);
  const [description, setDescription] = useState(report?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
  }, [router]);

  async function load() {
    try {
      const [k, d] = await Promise.all([listKpis(), listDashboards()]);
      setKpis(k);
      setDashboards(d);
      setListsError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      // A report is made of KPIs or a dashboard: without the lists there is nothing to choose.
      setListsError(
        err instanceof ApiError && err.message
          ? `The KPIs and dashboards to choose from could not be loaded: ${err.message}`
          : 'The KPIs and dashboards to choose from could not be loaded.',
      );
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
    setSubmitError(null);

    const cron = cronPreset === 'custom' ? customCron.trim() : cronPreset;
    const validRecipients = recipients.map((r) => r.trim()).filter(Boolean);
    // Say what is wrong before sending anything (plan 7.4).
    const problem = (name.trim().length < 2 ? 'Give the report a name.' : null) ?? (cronPreset === 'custom' ? cronProblem(customCron) : null) ?? recipientsProblem(recipients);
    if (problem) {
      setSubmitError(problem);
      return;
    }
    setSubmitting(true);

    try {
      if (report) {
        // Every field is sent: an emptied one (no dashboard, no KPIs, no description) must be saved as empty.
        await updateScheduledReport(report.id, {
          name: name.trim(),
          cron,
          format,
          recipients: validRecipients,
          dashboardId: selectedDashboardId || null,
          kpiIds: selectedKpiIds,
          description: description.trim(),
        });
        router.push(`/reports/${report.id}`);
        return;
      }
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
      setSubmitError(err instanceof ApiError ? err.message : report ? 'The changes could not be saved' : 'Failed to create report');
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveCron = cronPreset === 'custom' ? customCron : cronPreset;
  const formatHint: Record<ReportFormat, string> = {
    PDF: 'Presentation-grade layout, ideal for board distribution.',
    EXCEL: 'Spreadsheet with raw values for further analysis.',
    CSV: 'Plain delimited values for import into other tools.',
  };

  return (
    <AppShell
      title={report ? 'Edit' : 'New report'}
      crumbs={[
        { label: 'Execute' },
        { label: 'Reports', href: '/reports' },
        ...(report ? [{ label: report.name, href: `/reports/${report.id}` }] : []),
      ]}
    >
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong" data-testid="report-form-heading">
            {report ? `Edit “${report.name}”` : 'New scheduled report'}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            {report
              ? 'Change what it covers, when it runs and who receives it. Its run history is kept, and it keeps running as the person who made it.'
              : 'Configure a report source, schedule, and recipients. It runs as you, so your KPI visibility applies.'}
          </p>
        </header>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="report-name" required>
                  Report name
                </Label>
                <Input
                  id="report-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  data-testid="report-name-input"
                  placeholder="Monthly Revenue Report"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="report-description">
                  Description{' '}
                  <span className="font-normal text-content-muted">(optional)</span>
                </Label>
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  data-testid="report-description-input"
                  placeholder="What this report covers and who it's for."
                />
              </div>
            </CardContent>
          </Card>

          {/* Source */}
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="report-format">Format</Label>
                <Select
                  id="report-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ReportFormat)}
                  disabled={submitting}
                  data-testid="report-format-select"
                >
                  <option value="PDF">PDF</option>
                  <option value="EXCEL">Excel</option>
                  <option value="CSV">CSV</option>
                </Select>
                <p className="text-xs text-content-muted">{formatHint[format]}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="report-dashboard">
                  Dashboard <span className="font-normal text-content-muted">(optional)</span>
                </Label>
                <Select
                  id="report-dashboard"
                  value={selectedDashboardId}
                  onChange={(e) => setSelectedDashboardId(e.target.value)}
                  disabled={submitting}
                  data-testid="report-dashboard-select"
                >
                  <option value="">No specific dashboard</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              {kpis.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-content-strong">
                    KPIs{' '}
                    <span className="font-normal text-content-muted">
                      (optional — leave empty for all)
                    </span>
                  </legend>
                  <ul
                    className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-border-divider bg-surface-1 p-2 sm:grid-cols-2"
                    data-testid="report-kpi-list"
                  >
                    {kpis.map((kpi) => {
                      const checked = selectedKpiIds.includes(kpi.id);
                      return (
                        <li key={kpi.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-fast ${
                              checked
                                ? 'border-accent-primary bg-accent-bg text-content-strong'
                                : 'border-border bg-surface-bg text-content hover:bg-surface-hover'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKpi(kpi.id)}
                              disabled={submitting}
                              data-testid={`report-kpi-checkbox-${kpi.id}`}
                              className="h-3.5 w-3.5 rounded border-border text-accent-primary focus:ring-ring"
                            />
                            <span className="truncate">{kpi.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {CRON_PRESETS.map((preset) => {
                  const active = cronPreset === preset.value;
                  return (
                    <label
                      key={preset.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors duration-fast ${
                        active
                          ? 'border-accent-primary bg-accent-bg'
                          : 'border-border hover:bg-surface-hover'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cronPreset"
                        value={preset.value}
                        checked={active}
                        onChange={() => setCronPreset(preset.value)}
                        disabled={submitting}
                        className="text-accent-primary focus:ring-ring"
                      />
                      <span className="text-content-strong">{preset.label}</span>
                    </label>
                  );
                })}
              </div>

              {cronPreset === 'custom' && (
                <Input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  disabled={submitting}
                  placeholder="0 9 * * 1-5"
                  data-testid="report-cron-custom-input"
                  className="font-mono"
                />
              )}
              {cronPreset === 'custom' && (
                <p className="text-xs text-content-muted">
                  Five parts: minute, hour, day of the month, month, weekday. For example <span className="font-mono">0 9 * * 1-5</span> is Monday to Friday at 09:00.
                </p>
              )}

              {/* What the choice means, on whose clock: the API runs a report in the organisation's time zone. */}
              {effectiveCron.trim() && (
                <p className="text-xs text-content-muted" data-testid="report-schedule-words">
                  Runs: <span className="text-content-strong">{scheduleInWords(effectiveCron)}, {fmt.organizationTimezone} time</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recipients */}
          <Card>
            <CardHeader>
              <CardTitle>Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recipients.map((email, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => updateRecipient(index, e.target.value)}
                    disabled={submitting}
                    placeholder="user@example.com"
                    data-testid={`report-recipient-${index}`}
                    className="flex-1"
                  />
                  {recipients.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRecipient(index)}
                      disabled={submitting}
                      aria-label={`Remove recipient ${index + 1}`}
                      leftIcon={<X className="h-4 w-4" aria-hidden />}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addRecipient}
                disabled={submitting}
                data-testid="report-add-recipient"
                leftIcon={<Plus className="h-4 w-4" aria-hidden />}
              >
                Add recipient
              </Button>
            </CardContent>
          </Card>

          {listsError && (
            <div
              role="alert"
              data-testid="report-lists-error"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              <span>{listsError}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              data-testid="report-create-error"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              isLoading={submitting}
              disabled={submitting}
              data-testid={report ? 'report-save-submit' : 'report-create-submit'}
            >
              {report ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Creating…' : 'Create report'}
            </Button>
            <Link href={report ? `/reports/${report.id}` : '/reports'}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
