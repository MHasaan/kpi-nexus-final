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
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
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
import { currentLoginRedirect } from '../../../lib/auth-redirect';

const SEVERITY_META: Record<AlertSeverity, { tone: BadgeTone; Icon: typeof AlertTriangle; label: string }> = {
  HIGH: { tone: 'error', Icon: OctagonAlert, label: 'High' },
  MEDIUM: { tone: 'warning', Icon: AlertTriangle, label: 'Medium' },
  LOW: { tone: 'info', Icon: Info, label: 'Low' },
};

const TYPE_LABEL: Record<AlertRuleType, string> = {
  STATIC_THRESHOLD: 'Threshold',
  DYNAMIC_STDDEV: 'Anomaly (σ)',
  RATE_OF_CHANGE: 'Rate of change',
  NO_DATA: 'No data',
  COMPOSITE: 'Composite',
};

const linkSecondary =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const linkPrimary =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface EditDraft {
  name: string;
  severity: AlertSeverity;
  description: string;
}

export default function AlertRulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [kpiNames, setKpiNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
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

  function startEdit(rule: AlertRule) {
    setConfirmDeleteId(null);
    setEditingId(rule.id);
    setDraft({ name: rule.name, severity: rule.severity, description: rule.description ?? '' });
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    await run(id, () =>
      updateAlertRule(id, {
        name: draft.name.trim(),
        severity: draft.severity,
        description: draft.description.trim(),
      }),
    );
    setEditingId(null);
    setDraft(null);
  }

  const activeCount = (rules ?? []).filter((r) => r.isActive).length;

  return (
    <AppShell title="Alert rules" crumbs={[{ label: 'Workspace' }, { label: 'Alerts', href: '/alerts' }]}>
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
                  if (editingId === rule.id && draft) {
                    return (
                      <TableRow key={rule.id} data-testid={`alert-rule-row-${rule.id}`}>
                        <TableCell colSpan={6}>
                          <form
                            className="grid gap-3 py-2 sm:grid-cols-[1fr_10rem]"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void saveEdit(rule.id);
                            }}
                          >
                            <label className="flex flex-col gap-1 text-xs font-medium text-content-muted">
                              Name
                              <Input
                                value={draft.name}
                                minLength={2}
                                maxLength={160}
                                required
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-content-muted">
                              Severity
                              <Select
                                value={draft.severity}
                                onChange={(e) => setDraft({ ...draft, severity: e.target.value as AlertSeverity })}
                              >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                              </Select>
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-content-muted sm:col-span-2">
                              Description
                              <Textarea
                                rows={2}
                                maxLength={2000}
                                value={draft.description}
                                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                              />
                            </label>
                            <div className="flex gap-2 sm:col-span-2">
                              <Button type="submit" size="sm" disabled={busy || draft.name.trim().length < 2}>
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(null);
                                  setDraft(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={rule.id} data-testid={`alert-rule-row-${rule.id}`}>
                      <TableCell>
                        <div className="font-medium text-content-strong">{rule.name}</div>
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
                                onClick={() => {
                                  setEditingId(null);
                                  setConfirmDeleteId(rule.id);
                                }}
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
