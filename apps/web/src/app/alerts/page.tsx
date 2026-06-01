'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BellOff, Check, OctagonAlert, Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import {
  acknowledgeAlert,
  ApiError,
  clearTokens,
  getAccessToken,
  listAlerts,
  resolveAlert,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
} from '../../lib/api-client';

const SEVERITY_META: Record<AlertSeverity, { tone: BadgeTone; Icon: typeof AlertTriangle; label: string }> = {
  HIGH: { tone: 'error', Icon: OctagonAlert, label: 'High' },
  MEDIUM: { tone: 'warning', Icon: AlertTriangle, label: 'Medium' },
  LOW: { tone: 'info', Icon: Info, label: 'Low' },
};

const STATUS_TONE: Record<AlertStatus, BadgeTone> = {
  OPEN: 'error',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
};

const STATUS_FILTERS = [
  { label: 'Open', value: 'OPEN' as const },
  { label: 'Acknowledged', value: 'ACKNOWLEDGED' as const },
  { label: 'Resolved', value: 'RESOLVED' as const },
  { label: 'All', value: 'ALL' as const },
];

const SEVERITY_FILTERS = [
  { label: 'All', value: 'ALL' as const },
  { label: 'High', value: 'HIGH' as const },
  { label: 'Medium', value: 'MEDIUM' as const },
  { label: 'Low', value: 'LOW' as const },
];

type FilterValue = AlertStatus | 'ALL';
type SeverityFilterValue = AlertSeverity | 'ALL';

function SeverityChip({ severity }: { severity: AlertSeverity }) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.Icon;
  return (
    <Badge tone={meta.tone}>
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterValue>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await listAlerts({
        ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
        ...(severityFilter === 'ALL' ? {} : { severity: severityFilter }),
      });
      setAlerts(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load alerts');
    }
  }, [statusFilter, severityFilter, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setAlerts(null);
    void refresh();
  }, [router, refresh]);

  async function handleAcknowledge(id: string) {
    setBusyId(id);
    try {
      await acknowledgeAlert(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to acknowledge');
    } finally {
      setBusyId(null);
    }
  }

  async function handleResolve(id: string) {
    setBusyId(id);
    try {
      await resolveAlert(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to resolve');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <RequirePermission permission="ALERTS_VIEW">
      <PageHeader
        title="Alerts"
        subtitle="Triage triggered alerts and keep your team ahead of incidents."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/alerts/channels"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Channels
            </Link>
            <PermissionGuard permission="KPI_EDIT">
              <Link
                href="/alerts/new"
                data-testid="alerts-new-link"
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                New alert rule
              </Link>
            </PermissionGuard>
          </div>
        }
      />

      <h1 data-testid="alerts-heading" className="sr-only">
        Alerts
      </h1>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as FilterValue)}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-muted">Severity</span>
          <Segmented
            options={SEVERITY_FILTERS}
            value={severityFilter}
            onChange={(v) => setSeverityFilter(v as SeverityFilterValue)}
          />
        </div>
        {/* Hidden testid anchors preserved for e2e filter selectors */}
        <div className="sr-only" aria-hidden>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-testid={`alerts-filter-${f.value}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-testid={`alerts-filter-severity-${f.value}`}
              onClick={() => setSeverityFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          data-testid="alerts-error"
          className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {!alerts && !loadError && (
        <Card className="mt-4 p-2">
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      )}

      {alerts && alerts.length === 0 && (
        <div className="mt-4" data-testid="alerts-empty">
          <EmptyState
            icon={BellOff}
            title="All clear"
            description="No alerts match this filter. Configure an alert rule to start monitoring your KPIs."
            action={
              <PermissionGuard permission="KPI_EDIT">
                <Link
                  href="/alerts/new"
                  className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  New alert rule
                </Link>
              </PermissionGuard>
            }
          />
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0" data-testid="alerts-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a) => (
                <TableRow key={a.id} data-testid={`alert-row-${a.id}`}>
                  <TableCell>
                    <SeverityChip severity={a.severity} />
                  </TableCell>
                  <TableCell className="text-content-strong">
                    <Link
                      href={`/alerts/${a.id}`}
                      data-testid={`alert-link-${a.id}`}
                      className="font-medium hover:text-accent-primary"
                    >
                      {a.message}
                    </Link>
                  </TableCell>
                  <TableCell data-testid={`alert-status-${a.id}`}>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-content-muted">
                    {new Date(a.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {a.status === 'OPEN' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Check className="h-3.5 w-3.5" />}
                          isLoading={busyId === a.id}
                          onClick={() => void handleAcknowledge(a.id)}
                          data-testid={`alert-ack-${a.id}`}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {a.status !== 'RESOLVED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={busyId === a.id}
                          onClick={() => void handleResolve(a.id)}
                          data-testid={`alert-resolve-${a.id}`}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
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
