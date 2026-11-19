'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../../../components/app-shell';
import { ReportForm } from '../../../../components/reports/report-form';
import { Button, Skeleton } from '../../../../components/ui';
import { ApiError, getAccessToken, getScheduledReport, type ScheduledReport } from '../../../../lib/api-client';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';

/**
 * Change a scheduled report. The form is the one a new report is made with,
 * filled with what is saved (see `ReportForm`).
 */
export default function EditReportPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ScheduledReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getScheduledReport(id).then(setReport, (e: unknown) =>
      setError(e instanceof ApiError && e.message ? e.message : 'The report could not be loaded.'),
    );
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    load();
  }, [load, router]);

  if (report) return <ReportForm report={report} />;

  return (
    <AppShell title="Edit" crumbs={[{ label: 'Execute' }, { label: 'Reports', href: '/reports' }]}>
      <div className="mx-auto w-full max-w-3xl">
        {error ? (
          <div
            role="alert"
            data-testid="report-edit-load-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            <span>{error}</span>
            <span className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={load}>
                Try again
              </Button>
              <Link href="/reports">
                <Button type="button" variant="ghost" size="sm">
                  Back to reports
                </Button>
              </Link>
            </span>
          </div>
        ) : (
          <div className="space-y-4" aria-hidden>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
