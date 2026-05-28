'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  deleteScheduledReport,
  getAccessToken,
  listScheduledReports,
  triggerScheduledReport,
  updateScheduledReport,
  type ScheduledReport,
} from '../../lib/api-client';

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ScheduledReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listScheduledReports();
      setReports(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load reports');
    }
  }

  async function handleTrigger(report: ScheduledReport) {
    setPendingId(report.id);
    setActionError(null);
    try {
      await triggerScheduledReport(report.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Failed to trigger ${report.name}`);
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleActive(report: ScheduledReport) {
    setPendingId(report.id);
    setActionError(null);
    try {
      await updateScheduledReport(report.id, { isActive: !report.isActive });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Failed to update ${report.name}`);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(report: ScheduledReport) {
    if (!window.confirm(`Delete scheduled report "${report.name}"?`)) return;
    setPendingId(report.id);
    setActionError(null);
    try {
      await deleteScheduledReport(report.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Failed to delete ${report.name}`);
    } finally {
      setPendingId(null);
    }
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
                Home
              </Link>
              <Link href="/dashboards" className="text-content-muted hover:text-content-strong">
                Dashboards
              </Link>
              <Link href="/reports" className="font-medium text-accent-primary" data-testid="nav-reports">
                Reports
              </Link>
              <Link href="/reports/board-pack" className="text-content-muted hover:text-content-strong">
                Board Pack
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-content-strong" data-testid="reports-heading">
              Scheduled Reports
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Automatically generate and deliver reports on a schedule.
            </p>
          </div>
          <Link
            href="/reports/new"
            data-testid="reports-new-link"
            className="inline-flex h-10 items-center rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
          >
            New report
          </Link>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="reports-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="reports-action-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {reports !== null && reports.length === 0 && (
          <div
            data-testid="reports-empty"
            className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
          >
            <p className="text-sm text-content-muted">No scheduled reports yet. Create your first one.</p>
          </div>
        )}

        {reports !== null && reports.length > 0 && (
          <div className="space-y-3" data-testid="reports-list">
            {reports.map((report) => {
              const lastRun = report.runs?.[0];
              return (
                <article
                  key={report.id}
                  data-testid={`report-row-${report.id}`}
                  className="rounded-lg border border-border bg-surface-1 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/reports/${report.id}`}
                          className="text-base font-semibold text-content-strong hover:text-accent-primary"
                        >
                          {report.name}
                        </Link>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            report.isActive
                              ? 'bg-status-success/10 text-status-success'
                              : 'bg-surface-2 text-content-muted'
                          }`}
                        >
                          {report.isActive ? 'active' : 'paused'}
                        </span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-default">
                          {report.format}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-content-muted">{report.cron}</p>
                      {lastRun && (
                        <p className="mt-1 text-xs text-content-muted">
                          Last run:{' '}
                          {lastRun.ranAt ? new Date(lastRun.ranAt).toLocaleString() : 'pending'}{' '}
                          &mdash;{' '}
                          <span
                            className={
                              lastRun.status === 'SUCCEEDED'
                                ? 'text-status-success'
                                : lastRun.status === 'FAILED'
                                  ? 'text-status-critical'
                                  : 'text-content-muted'
                            }
                          >
                            {lastRun.status.toLowerCase()}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTrigger(report)}
                        disabled={pendingId === report.id}
                        data-testid={`report-trigger-${report.id}`}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
                      >
                        Run now
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(report)}
                        disabled={pendingId === report.id}
                        data-testid={`report-toggle-${report.id}`}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
                      >
                        {report.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(report)}
                        disabled={pendingId === report.id}
                        data-testid={`report-delete-${report.id}`}
                        className="rounded-md border border-status-critical/40 px-3 py-1.5 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
