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
  MAX_DELIVERIES_PER_REQUEST,
  retryNotificationDelivery,
  type NotificationDelivery,
} from '../../../../lib/api-client';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';
import { RequirePermission } from '../../../../components/auth/require-permission';
import { usePermissions } from '../../../../lib/use-permissions';
import { useFormat } from '../../../../lib/format-context';
import { useToast } from '../../../../lib/use-toast';

const FIRST_PAGE = 100;
const OLDER_STEP = 200;

export default function DlqPage() {
  const fmt = useFormat();
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<NotificationDelivery[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // How many of the newest failed deliveries to ask for. "Show older" raises it, up to what the
  // API gives at once; a full answer means there may be more than is on the page.
  const [limit, setLimit] = useState(FIRST_PAGE);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await listNotificationDeliveries('FAILED', limit));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load deliveries');
    }
  }, [router, limit]);

  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void refresh();
  }, [router, refresh, allowed]);

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      await retryNotificationDelivery(id);
      await refresh();
      toast.success('Sent again', 'The delivery was tried once more; the row shows how it went.');
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
        title="Failed deliveries"
        titleTestId="dlq-heading"
        subtitle="Notifications that could not be delivered after every retry. See why, and send them again."
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-content-muted">
          <p data-testid="dlq-count">
            {rows.length < limit
              ? `${rows.length} failed deliver${rows.length === 1 ? 'y' : 'ies'}.`
              : limit < MAX_DELIVERIES_PER_REQUEST
                ? `Showing the newest ${rows.length}.`
                : `Showing the newest ${rows.length}. There may be older ones; retry or resolve some of these to see them.`}
          </p>
          {rows.length >= limit && limit < MAX_DELIVERIES_PER_REQUEST && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="dlq-show-older"
              onClick={() => setLimit((l) => Math.min(l + OLDER_STEP, MAX_DELIVERIES_PER_REQUEST))}
            >
              Show older
            </Button>
          )}
        </div>
      )}

      {rows && rows.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0" data-testid="dlq-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What failed</TableHead>
                <TableHead>Through</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} data-testid={`dlq-row-${d.id}`}>
                  {/* Which alert and channel, not a delivery id (F-070). */}
                  <TableCell className="max-w-sm text-content-strong">
                    {d.kpiName || d.alertMessage ? (
                      <>
                        {d.kpiName && <span className="font-medium">{d.kpiName}</span>}
                        {d.kpiName && d.alertMessage && <span className="text-content-muted">: </span>}
                        {d.alertMessage && <span className="text-content">{d.alertMessage}</span>}
                      </>
                    ) : (
                      <span className="font-mono text-xs text-content-muted">{d.id.slice(0, 10)}…</span>
                    )}
                  </TableCell>
                  <TableCell className="text-content">{d.channelName ?? (d.targetUserId ? `${d.kind ? d.kind.toLowerCase() : 'a message'} to a person` : 'In-app')}</TableCell>
                  <TableCell className="tabular-nums">
                    <Badge tone="warning">{d.attempts}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-content-muted">{d.error ?? '—'}</TableCell>
                  <TableCell className="tabular-nums text-content-muted">
                    {fmt.dateTime(d.createdAt)}
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
