'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Download,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getScheduledReport,
  triggerScheduledReport,
  type ReportRun,
  type ScheduledReport,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

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
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
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

  const crumbs = [
    { label: 'Execute' },
    { label: 'Reports', href: '/reports' },
    { label: report?.name ?? 'Report' },
  ];

  return (
    <AppShell title={report?.name ?? 'Report'} crumbs={crumbs}>
      {loadError && (
        <div
          role="alert"
          data-testid="report-detail-load-error"
          className="mb-6 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {report === null && !loadError && (
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {report && (
        <>
          <PageHeader
            title={report.name}
            titleTestId="report-detail-heading"
            subtitle={report.description ?? undefined}
            actions={
              <>
                <Button
                  variant="secondary"
                  onClick={() => void handleTrigger()}
                  isLoading={triggering}
                  disabled={triggering}
                  data-testid="report-detail-trigger"
                  leftIcon={<Play className="h-4 w-4" aria-hidden />}
                >
                  {triggering ? 'Running…' : 'Run now'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void refresh()}
                  data-testid="report-detail-refresh"
                  leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
                >
                  Refresh
                </Button>
              </>
            }
          />

          {/* Meta chips */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Badge tone={report.isActive ? 'success' : 'neutral'}>
              {report.isActive ? 'active' : 'paused'}
            </Badge>
            <Badge tone="info">{report.format}</Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono tabular-nums">{report.cron}</span>
            </span>
            {report.lastRunAt && (
              <span className="text-xs tabular-nums text-content-muted">
                Last run: {new Date(report.lastRunAt).toLocaleString()}
              </span>
            )}
            {report.nextRunAt && (
              <span className="text-xs tabular-nums text-content-muted">
                Next run: {new Date(report.nextRunAt).toLocaleString()}
              </span>
            )}
          </div>

          {report.recipients.length > 0 && (
            <p className="mb-6 text-xs text-content-muted">
              Delivered to {report.recipients.length} recipient
              {report.recipients.length === 1 ? '' : 's'} via email:{' '}
              <span className="text-content">{report.recipients.join(', ')}</span>
            </p>
          )}

          {triggered && (
            <div
              role="status"
              data-testid="report-trigger-success"
              className="mb-4 flex items-center gap-2 rounded-lg border border-status-success/40 bg-status-success-bg px-4 py-2 text-sm text-status-success"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Report triggered successfully.
            </div>
          )}

          {triggerError && (
            <div
              role="alert"
              data-testid="report-trigger-error"
              className="mb-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-2 text-sm text-status-critical"
            >
              {triggerError}
            </div>
          )}

          <section data-testid="report-runs-section">
            <Card>
              <CardHeader>
                <CardTitle>Run history</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.runs.length === 0 ? (
                  <div
                    data-testid="report-runs-empty"
                    className="px-6 py-10 text-center text-sm text-content-muted"
                  >
                    No runs yet. Trigger the report or wait for the schedule.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Ran at</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody data-testid="report-runs-table">
                      {report.runs.map((run) => (
                        <TableRow key={run.id} data-testid={`run-row-${run.id}`}>
                          <TableCell>
                            <RunStatusBadge status={run.status} />
                          </TableCell>
                          <TableCell className="tabular-nums text-content">
                            {run.ranAt ? new Date(run.ranAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            {run.status === 'SUCCEEDED' && run.fileUrl ? (
                              <a
                                href={run.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`run-download-${run.id}`}
                                className="inline-flex items-center gap-1.5 text-accent-primary hover:underline"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden />
                                Download
                              </a>
                            ) : (
                              <span className="text-content-muted">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-status-critical">
                            {run.error ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}
