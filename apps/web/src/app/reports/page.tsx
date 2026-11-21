'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';

import {
  ApiError,
  clearTokens,
  deleteScheduledReport,
  getAccessToken,
  listScheduledReports,
  triggerScheduledReport,
  updateScheduledReport,
  type ReportRun,
  type ScheduledReport,
} from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import { useConfirm } from '../../lib/use-confirm';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { useFormat } from '../../lib/format-context';
import { useToast } from '../../lib/use-toast';
import { scheduleInWords } from '../../lib/report-schedule';

const CRUMBS = [{ label: 'Execute' }, { label: 'Reports' }];

function RunStatusBadge({ status }: { status: ReportRun['status'] }) {
  if (status === 'SUCCEEDED') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> succeeded
      </Badge>
    );
  }
  if (status === 'FAILED') {
    return (
      <Badge tone="error">
        <XCircle className="h-3 w-3" aria-hidden /> failed
      </Badge>
    );
  }
  if (status === 'RUNNING') {
    return (
      <Badge tone="warning">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> running
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <CircleDashed className="h-3 w-3" aria-hidden /> {status.toLowerCase()}
    </Badge>
  );
}

export default function ReportsPage() {
  const fmt = useFormat();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [reports, setReports] = useState<ScheduledReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
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
      // Something happened: the only sign used to be the email (F-044).
      toast.success(`Running ${report.name} now`, 'The file appears under its runs in a moment.');
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
    const ok = await confirm({
      title: `Delete “${report.name}”?`,
      description: 'It stops being sent. Reports already delivered are not affected.',
      confirmLabel: 'Delete report',
      tone: 'danger',
      testId: 'report-delete-confirm',
    });
    if (!ok) return;
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
    <AppShell title="Reports" crumbs={CRUMBS}>
      <PageHeader
        title="Scheduled reports"
        titleTestId="reports-heading"
        subtitle="Automatically generate and deliver reports on a schedule. Reports run as their creator."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reports/board-pack"
              data-testid="reports-board-pack-link"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Board pack
            </Link>
            <PermissionGuard permission="REPORTS_MANAGE">
              <Link href="/reports/new" data-testid="reports-new-link">
                <Button leftIcon={<Plus className="h-4 w-4" aria-hidden />}>New report</Button>
              </Link>
            </PermissionGuard>
          </div>
        }
      />

      {loadError && (
        <div
          role="alert"
          data-testid="reports-load-error"
          className="mb-6 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          data-testid="reports-action-error"
          className="mb-6 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {actionError}
        </div>
      )}

      {reports === null && !loadError && (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {reports !== null && reports.length === 0 && (
        <div data-testid="reports-empty">
          <EmptyState
            icon={FileText}
            title="No scheduled reports yet"
            description="Create your first report to deliver KPIs to stakeholders on a schedule."
            action={
              <PermissionGuard permission="REPORTS_MANAGE">
                <Link href="/reports/new">
                  <Button leftIcon={<Plus className="h-4 w-4" aria-hidden />}>New report</Button>
                </Link>
              </PermissionGuard>
            }
          />
        </div>
      )}

      {reports !== null && reports.length > 0 && (
        <div className="space-y-3" data-testid="reports-list">
          {reports.map((report) => {
            const lastRun = report.runs?.[0];
            const busy = pendingId === report.id;
            return (
              <Card
                key={report.id}
                data-testid={`report-row-${report.id}`}
                className="p-5 transition-shadow duration-base hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/reports/${report.id}`}
                        className="text-base font-semibold text-content-strong hover:text-accent-primary"
                      >
                        {report.name}
                      </Link>
                      <Badge tone={report.isActive ? 'success' : 'neutral'}>
                        {report.isActive ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                        ) : (
                          <Pause className="h-3 w-3" aria-hidden />
                        )}
                        {report.isActive ? 'active' : 'paused'}
                      </Badge>
                      <Badge tone="info">{report.format}</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {/* On whose clock: the API runs a report in the organisation's time zone (F-044). */}
                        <span>
                          {scheduleInWords(report.cron)}, {fmt.organizationTimezone} time
                        </span>
                      </span>
                      {report.recipients.length > 0 && (
                        <span className="tabular-nums">
                          {report.recipients.length} recipient
                          {report.recipients.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    {lastRun && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                        <span>Last run</span>
                        <RunStatusBadge status={lastRun.status} />
                        <span className="tabular-nums">
                          {lastRun.ranAt
                            ? fmt.dateTime(lastRun.ranAt)
                            : 'pending'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleTrigger(report)}
                      disabled={busy}
                      data-testid={`report-trigger-${report.id}`}
                      leftIcon={<Play className="h-3.5 w-3.5" aria-hidden />}
                    >
                      Run now
                    </Button>
                    {/* Pausing and deleting are REPORTS_MANAGE on the API (UI-013). */}
                    <PermissionGuard permission="REPORTS_MANAGE">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleToggleActive(report)}
                      disabled={busy}
                      data-testid={`report-toggle-${report.id}`}
                      leftIcon={
                        report.isActive ? (
                          <Pause className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden />
                        )
                      }
                    >
                      {report.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDelete(report)}
                      disabled={busy}
                      data-testid={`report-delete-${report.id}`}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                    >
                      Delete
                    </Button>
                    </PermissionGuard>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
