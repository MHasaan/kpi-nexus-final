'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getScheduledReport,
  triggerScheduledReport,
  type ReportRun,
  type ScheduledReport,
} from '../../../lib/api-client';

function statusClass(status: ReportRun['status']): string {
  switch (status) {
    case 'SUCCEEDED':
      return 'text-status-success';
    case 'FAILED':
      return 'text-status-critical';
    case 'RUNNING':
      return 'text-status-warning';
    default:
      return 'text-content-muted';
  }
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const reportId = params.id;

  const [report, setReport] = useState<ScheduledReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, reportId]);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await getScheduledReport(reportId);
      setReport(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load report');
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerError(null);
    setTriggered(false);
    try {
      await triggerScheduledReport(reportId);
      setTriggered(true);
      setTimeout(() => setTriggered(false), 3000);
      await refresh();
    } catch (err) {
      setTriggerError(err instanceof ApiError ? err.message : 'Failed to trigger report');
    } finally {
      setTriggering(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
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
            {report && (
              <>
                <span className="text-content-muted">/</span>
                <span className="font-medium text-content-strong">{report.name}</span>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {loadError && (
          <div
            role="alert"
            data-testid="report-detail-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {report && (
          <>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1
                  className="text-2xl font-semibold text-content-strong"
                  data-testid="report-detail-heading"
                >
                  {report.name}
                </h1>
                {report.description && (
                  <p className="mt-1 text-sm text-content-muted">{report.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-content-muted">
                  <span>
                    Status:{' '}
                    <span
                      className={
                        report.isActive ? 'text-status-success' : 'text-content-muted'
                      }
                    >
                      {report.isActive ? 'active' : 'paused'}
                    </span>
                  </span>
                  <span>Format: {report.format}</span>
                  <span className="font-mono">{report.cron}</span>
                  {report.lastRunAt && (
                    <span>Last run: {new Date(report.lastRunAt).toLocaleString()}</span>
                  )}
                  {report.nextRunAt && (
                    <span>Next run: {new Date(report.nextRunAt).toLocaleString()}</span>
                  )}
                </div>
                {report.recipients.length > 0 && (
                  <p className="mt-1 text-xs text-content-muted">
                    Recipients: {report.recipients.join(', ')}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleTrigger()}
                  disabled={triggering}
                  data-testid="report-detail-trigger"
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-content-default hover:bg-surface-2 disabled:opacity-50"
                >
                  {triggering ? 'Running…' : 'Run now'}
                </button>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  data-testid="report-detail-refresh"
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-content-default hover:bg-surface-2"
                >
                  Refresh
                </button>
              </div>
            </div>

            {triggered && (
              <div
                role="status"
                data-testid="report-trigger-success"
                className="mb-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-2 text-sm text-status-success"
              >
                Report triggered successfully.
              </div>
            )}

            {triggerError && (
              <div
                role="alert"
                data-testid="report-trigger-error"
                className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-2 text-sm text-status-critical"
              >
                {triggerError}
              </div>
            )}

            <section data-testid="report-runs-section">
              <h2 className="mb-4 text-lg font-semibold text-content-strong">Run History</h2>

              {report.runs.length === 0 ? (
                <div
                  data-testid="report-runs-empty"
                  className="rounded-lg border border-dashed border-border bg-surface-1 p-6 text-center"
                >
                  <p className="text-sm text-content-muted">No runs yet. Trigger the report or wait for the schedule.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-1">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted">Ran at</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted">File</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface-bg" data-testid="report-runs-table">
                      {report.runs.map((run) => (
                        <tr key={run.id} data-testid={`run-row-${run.id}`}>
                          <td className={`px-4 py-3 font-medium capitalize ${statusClass(run.status)}`}>
                            {run.status.toLowerCase()}
                          </td>
                          <td className="px-4 py-3 text-content-default">
                            {run.ranAt ? new Date(run.ranAt).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {run.status === 'SUCCEEDED' && run.fileUrl ? (
                              <a
                                href={run.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`run-download-${run.id}`}
                                className="text-accent-primary hover:underline"
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-content-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-status-critical">
                            {run.error ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
