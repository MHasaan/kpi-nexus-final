'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  listNotificationDeliveries,
  retryNotificationDelivery,
  type NotificationDelivery,
} from '../../../../lib/api-client';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';
import { RequirePermission } from '../../../../components/auth/require-permission';

export default function DlqPage() {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationDelivery[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await listNotificationDeliveries('FAILED'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load deliveries');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      await retryNotificationDelivery(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Retry failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      {/* FE-014: same permission the page's API enforces — no broken 403 screens. */}
      <RequirePermission permission="ORG_SETTINGS">
      <PageHeader
        title="Failed deliveries (DLQ)"
        subtitle="Notifications that exhausted their retries. Inspect the error and re-queue them."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/settings/notifications"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Preferences
            </Link>
            <Button
              variant="secondary"
              size="md"
              onClick={() => void refresh()}
              data-testid="dlq-refresh"
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </div>
        }
      />
      <h1 data-testid="dlq-heading" className="sr-only">
        Failed deliveries (DLQ)
      </h1>

      {loadError && (
        <div
          role="alert"
          data-testid="dlq-error"
          className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {!rows && !loadError && (
        <Card className="mt-4 p-2">
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      )}

      {rows && rows.length === 0 && (
        <div className="mt-4" data-testid="dlq-empty">
          <EmptyState
            icon={CheckCircle2}
            title="No failed deliveries"
            description="Every notification was delivered successfully. Nothing to retry right now."
          />
        </div>
      )}

      {rows && rows.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0" data-testid="dlq-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} data-testid={`dlq-row-${d.id}`}>
                  <TableCell className="font-mono text-xs text-content-muted">
                    {d.id.slice(0, 10)}…
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <Badge tone="warning">{d.attempts}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-content-muted">{d.error ?? '—'}</TableCell>
                  <TableCell className="tabular-nums text-content-muted">
                    {new Date(d.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busyId === d.id}
                      onClick={() => void handleRetry(d.id)}
                      data-testid={`dlq-retry-${d.id}`}
                      leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                    >
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      </RequirePermission>
    </AppShell>
  );
}
