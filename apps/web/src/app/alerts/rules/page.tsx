'use client';

/**
 * Alert rules (FE-006). Rules used to be reachable only through an alert they
 * had already raised — a misconfigured or noisy rule couldn't be found or
 * switched off. This page lists every rule and lets editors pause/resume,
 * edit (name, severity, description) and delete them.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, OctagonAlert, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
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
} from '../../../components/ui';
import type { BadgeTone } from '../../../components/ui';
import {
  ApiError,
  clearTokens,
  deleteAlertRule,
  getAccessToken,
  listAlertRules,
  listKpis,
  updateAlertRule,
  type AlertRule,
  type AlertRuleType,
  type AlertSeverity,
} from '../../../lib/api-client';
import { savedRuleSentence } from '../../../lib/alert-rule-form';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { useFormat } from '../../../lib/format-context';

const SEVERITY_META: Record<AlertSeverity, { tone: BadgeTone; Icon: typeof AlertTriangle; label: string }> = {
  HIGH: { tone: 'error', Icon: OctagonAlert, label: 'High' },
  MEDIUM: { tone: 'warning', Icon: AlertTriangle, label: 'Medium' },
  LOW: { tone: 'info', Icon: Info, label: 'Low' },
};

/** The kinds of rule, named as the rule's own form names them. */
const TYPE_LABEL: Record<AlertRuleType, string> = {
  STATIC_THRESHOLD: 'Crosses a fixed value',
  DYNAMIC_STDDEV: 'Unusual for this KPI',
  RATE_OF_CHANGE: 'Rises or falls quickly',
  NO_DATA: 'No value recorded',
  COMPOSITE: 'Several conditions',
};

const linkSecondary =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const linkPrimary =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';


export default function AlertRulesPage() {
  const fmt = useFormat();
  const router = useRouter();
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [kpiNames, setKpiNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return true;
      }
      return false;
    },
    [router],
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [r, kpis] = await Promise.all([listAlertRules(), listKpis()]);
      setRules(r);
      setKpiNames(Object.fromEntries(kpis.map((k) => [k.id, k.name])));
    } catch (err) {
      if (handleAuthError(err)) return;
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load alert rules');
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [router, refresh]);

  const sorted = useMemo(
    () =>
      [...(rules ?? [])].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
      ),
    [rules],
  );

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      if (handleAuthError(err)) return;
      setActionError(err instanceof ApiError ? err.message : 'The change could not be saved');
    } finally {
      setBusyId(null);
    }
  }

  /** The whole rule opens in the form that made it (F-069: the inline edit took only name, severity, description). */
  function startEdit(rule: AlertRule) {
    router.push(`/alerts/new?edit=${rule.id}`);
  }

  const activeCount = (rules ?? []).filter((r) => r.isActive).length;

  return (
    <AppShell title="Alert rules" crumbs={[{ label: 'Measure' }, { label: 'Alerts', href: '/alerts' }]}>
      <RequirePermission permission="ALERTS_VIEW">
        <PageHeader
          title="Alert rules"
          titleTestId="alert-rules-heading"
          subtitle={
            rules
              ? `${rules.length} rule${rules.length === 1 ? '' : 's'} · ${activeCount} active`
              : 'The conditions that raise alerts on your KPIs.'
          }
          actions={
            <div className="flex items-center gap-2">
              <Link href="/alerts" className={linkSecondary}>
                Triggered alerts
              </Link>
              <PermissionGuard permission="KPI_EDIT">
                <Link href="/alerts/new" data-testid="alert-rules-new-link" className={linkPrimary}>
                  New alert rule
                </Link>
              </PermissionGuard>
            </div>
          }
        />

        {(loadError || actionError) && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError ?? actionError}
          </div>
        )}

        <Card className="mt-5 overflow-hidden p-0">
          {rules === null && !loadError ? (
            <div className="space-y-2 p-4" aria-busy>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No alert rules yet"
              description="Rules watch a KPI and raise an alert when it crosses a threshold, moves too fast, or stops reporting."
              action={
                <PermissionGuard permission="KPI_EDIT">
                  <Link href="/alerts/new" className={linkPrimary}>
                    Create the first rule
                  </Link>
                </PermissionGuard>
              }
            />
          ) : (
            <Table data-testid="alert-rules-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((rule) => {
                  const sev = SEVERITY_META[rule.severity];
                  const busy = busyId === rule.id;
                  return (
                    <TableRow key={rule.id} data-testid={`alert-rule-row-${rule.id}`}>
                      <TableCell>
                        <div className="font-medium text-content-strong">{rule.name}</div>
                        {/* What it watches for: the type alone did not tell two rules on one KPI apart. */}
                        <div className="mt-0.5 text-xs text-content" data-testid={`alert-rule-sentence-${rule.id}`}>
                          {savedRuleSentence(rule, fmt.number)}
                        </div>
                        {rule.description && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-content-muted">{rule.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-content">{kpiNames[rule.kpiId] ?? '—'}</TableCell>
                      <TableCell className="text-content">{TYPE_LABEL[rule.ruleType] ?? rule.ruleType}</TableCell>
                      <TableCell>
                        <Badge tone={sev.tone}>
                          <sev.Icon aria-hidden className="mr-1 h-3 w-3" />
                          {sev.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={rule.isActive ? 'success' : 'neutral'} data-testid={`alert-rule-status-${rule.id}`}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <PermissionGuard permission="KPI_EDIT">
                          {confirmDeleteId === rule.id ? (
                            <span className="inline-flex items-center gap-2 text-xs text-content-muted">
                              Delete this rule?
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                data-testid={`alert-rule-confirm-delete-${rule.id}`}
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  void run(rule.id, () => deleteAlertRule(rule.id));
                                }}
                              >
                                Delete
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                                Keep
                              </Button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                data-testid={`alert-rule-toggle-${rule.id}`}
                                aria-label={rule.isActive ? `Pause ${rule.name}` : `Resume ${rule.name}`}
                                onClick={() => void run(rule.id, () => updateAlertRule(rule.id, { isActive: !rule.isActive }))}
                              >
                                {rule.isActive ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
                                {rule.isActive ? 'Pause' : 'Resume'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Edit ${rule.name}`}
                                onClick={() => startEdit(rule)}
                              >
                                <Pencil aria-hidden className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`Delete ${rule.name}`}
                                data-testid={`alert-rule-delete-${rule.id}`}
                                onClick={() => setConfirmDeleteId(rule.id)}
                              >
                                <Trash2 aria-hidden className="h-4 w-4" />
                              </Button>
                            </span>
                          )}
                        </PermissionGuard>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </RequirePermission>
    </AppShell>
  );
}
