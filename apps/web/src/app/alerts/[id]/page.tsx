'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, Check, Info, ListTree, OctagonAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '../../../components/ui';
import type { BadgeTone } from '../../../components/ui';
import {
  acknowledgeAlert,
  ApiError,
  clearTokens,
  getAccessToken,
  getAlert,
  getAlertRule,
  listNotificationChannels,
  listNotificationDeliveriesForAlert,
  listRoles,
  listUsers,
  resolveAlert,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
  type EscalationLevelInput,
  type NotificationDelivery,
} from '../../../lib/api-client';
import { ALERT_STATUS_LABELS, labelFor } from '../../../lib/labels';
import { type RecipientDirectory, levelSummary } from '../../../lib/alert-rule-form';
import { deliveryLine, narrowLevels } from '../../../lib/alert-trail';
import { useAsyncData } from '../../../lib/use-async-data';
import { useKpiNames } from '../../../lib/use-kpi-names';
import { usePeople } from '../../../lib/use-people';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { usePermissions } from '../../../lib/use-permissions';
import { useFormat } from '../../../lib/format-context';

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

const DELIVERY_STATUS_TONE: Record<string, BadgeTone> = {
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'error',
  SUPPRESSED: 'neutral',
};

function Field({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="kn-eyebrow">{label}</dt>
      <dd className="mt-1 break-all font-medium tabular-nums text-content-strong" data-testid={testId}>{value}</dd>
    </div>
  );
}

function LinkField({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div>
      <dt className="kn-eyebrow">{label}</dt>
      <dd className="mt-1 break-all font-medium tabular-nums">
        <Link href={href} className="text-accent-primary hover:underline" data-testid="alert-detail-kpi-link">
          {value}
        </Link>
      </dd>
    </div>
  );
}

export default function AlertDetailPage() {
  const fmt = useFormat();
  const router = useRouter();
  const { nameOf } = useKpiNames();
  const [ruleName, setRuleName] = useState<string | null>(null);
  const [runbook, setRunbook] = useState<string | null>(null);
  const params = useParams<{ id: string }>();
  const alertId = params.id;
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Escalation trail: configured levels (from the rule) + best-effort deliveries.
  const [escalationLevels, setEscalationLevels] = useState<EscalationLevelInput[] | null>(null);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[] | null>(null);
  const [trailLoaded, setTrailLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setAlert(await getAlert(alertId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setLoadError('Alert not found.');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load alert');
    }
  }, [alertId, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [router, refresh]);

  // Load the escalation trail once the alert resolves. Configured levels come
  // from the rule; the delivery history is best-effort (needs ORG_SETTINGS and
  // may 403 — in that case we simply omit deliveries and show only the levels).
  const ruleId = alert?.alertRuleId ?? null;
  const { ready: permsReady, has } = usePermissions();
  const canSeeDeliveries = permsReady && has('ORG_SETTINGS');
  const resolvedAlertId = alert?.id ?? null;
  useEffect(() => {
    if (!resolvedAlertId || !ruleId) {
      setTrailLoaded(true);
      return;
    }
    let cancelled = false;
    setTrailLoaded(false);
    async function loadTrail(rId: string, aId: string) {
      try {
        const rule = await getAlertRule(rId);
        if (!cancelled) {
          setRuleName(rule.name);
          setRunbook(rule.description?.trim() || null);
          setEscalationLevels(narrowLevels(rule.escalationRule?.levels));
        }
      } catch {
        // Rule fetch failed — show the section without configured levels.
        if (!cancelled) setEscalationLevels([]);
      }
      // Delivery history is an ORG_SETTINGS resource (FE-014) — don't request it otherwise.
      if (canSeeDeliveries) {
        try {
          const rows = await listNotificationDeliveriesForAlert(aId);
          if (!cancelled) setDeliveries(rows);
        } catch {
          if (!cancelled) setDeliveries(null);
        }
      } else if (!cancelled) {
        setDeliveries(null);
      }
      if (!cancelled) setTrailLoaded(true);
    }
    void loadTrail(ruleId, resolvedAlertId);
    return () => {
      cancelled = true;
    };
  }, [ruleId, resolvedAlertId, canSeeDeliveries]);

  // The names behind the trail's ids. Each list is asked for only by someone allowed to read it;
  // a name that cannot be read is said as "one person" or "a channel", never as an id or a count.
  const trailUserIds = [
    ...(escalationLevels ?? []).flatMap((level) => level.notifyUserIds),
    ...(deliveries ?? []).map((d) => d.targetUserId),
  ];
  const people = usePeople(trailUserIds);
  const roles = useAsyncData(() => listRoles(), [], { enabled: permsReady && Boolean(ruleId) });
  const everyone = useAsyncData(() => listUsers(), [], { enabled: permsReady && has('USERS_VIEW') && Boolean(ruleId) });
  const channels = useAsyncData(() => listNotificationChannels(), [], { enabled: canSeeDeliveries && Boolean(ruleId) });
  const directory: RecipientDirectory = {
    roles: roles.data ?? [],
    users: everyone.data ?? [],
    channels: channels.data ?? [],
    names: people,
  };

  async function act(fn: (id: string) => Promise<Alert>) {
    setBusy(true);
    try {
      await fn(alertId);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const severityMeta = alert ? SEVERITY_META[alert.severity] : null;

  return (
    <AppShell>
      <RequirePermission permission="ALERTS_VIEW">
      <div className="mx-auto max-w-3xl">
        {loadError && (
          <div
            role="alert"
            data-testid="alert-detail-error"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {!alert && !loadError && (
          <div className="space-y-4">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {alert && severityMeta && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={severityMeta.tone}>
                    <severityMeta.Icon className="h-3 w-3" aria-hidden />
                    {severityMeta.label}
                  </Badge>
                  <Badge tone={STATUS_TONE[alert.status]} data-testid="alert-detail-status">
                    {labelFor(ALERT_STATUS_LABELS, alert.status)}
                  </Badge>
                </div>
                <h1
                  className="mt-3 text-2xl font-bold tracking-tight text-content-strong"
                  data-testid="alert-detail-message"
                >
                  {alert.message}
                </h1>
                <p className="mt-1 text-sm text-content-muted">
                  Raised {fmt.dateTime(alert.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {alert.status === 'OPEN' && (
                  <Button
                    variant="secondary"
                    size="md"
                    isLoading={busy}
                    onClick={() => void act(acknowledgeAlert)}
                    data-testid="alert-detail-ack"
                    leftIcon={<Check className="h-4 w-4" />}
                  >
                    Acknowledge
                  </Button>
                )}
                {alert.status !== 'RESOLVED' && (
                  <Button
                    size="md"
                    isLoading={busy}
                    onClick={() => void act(resolveAlert)}
                    data-testid="alert-detail-resolve"
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>What set it off</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <LinkField label="KPI" value={nameOf(alert.kpiId)} href={`/kpis/${alert.kpiId}`} />
                  <Field label="Rule" value={alert.alertRuleId ? (ruleName ?? 'A rule that has since been deleted') : 'No rule (raised directly)'} />
                  {/* The rule's "What to do when it fires", where the person handling the alert reads it (F-035). */}
                  {runbook && <Field label="What to do" value={runbook} testId="alert-what-to-do" />}
                  <Field
                    label="Acknowledged"
                    value={alert.acknowledgedAt ? fmt.dateTime(alert.acknowledgedAt) : '—'}
                  />
                  <Field
                    label="Resolved"
                    value={alert.resolvedAt ? fmt.dateTime(alert.resolvedAt) : '—'}
                  />
                  {alert.meta && typeof alert.meta.value === 'number' && (
                    <Field label="The value" value={typeof alert.meta.value === 'number' ? fmt.number(alert.meta.value) : String(alert.meta.value)} />
                  )}
                </dl>
              </CardContent>
            </Card>

            {alert.alertRuleId && (
              <Card className="mt-6" data-testid="escalation-trail">
                <CardHeader>
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <ListTree className="h-4 w-4 text-content-muted" aria-hidden />
                      Who was told
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!trailLoaded ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-6 w-1/2" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <p className="kn-eyebrow">Who is told, and when</p>
                        {escalationLevels && escalationLevels.length > 0 ? (
                          <ol className="mt-2 space-y-2" data-testid="escalation-levels">
                            {escalationLevels.map((level, i) => (
                              <li
                                key={i}
                                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm"
                              >
                                <span className="font-semibold text-content-strong">Step {i + 1}</span>
                                {/* The same sentence the rule's form shows: when, and who by name. */}
                                <span className="text-content">{levelSummary(level, directory)}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p
                            className="mt-2 text-sm text-content-muted"
                            data-testid="escalation-levels-empty"
                          >
                            This rule notifies nobody: the alert only appears on the Alerts page.
                          </p>
                        )}
                      </div>

                      {deliveries && deliveries.length > 0 && (
                        <div data-testid="escalation-deliveries">
                          <p className="kn-eyebrow">What was sent</p>
                          <ul className="mt-2 space-y-2">
                            {deliveries.map((d) => {
                              // What it was and to whom — an email to a person used to read "In-app".
                              const line = deliveryLine(d, { people, channels: channels.data ?? [] });
                              return (
                                <li
                                  key={d.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-content-strong">{line.what}</span>
                                  <span className="flex items-center gap-3">
                                    <Badge tone={DELIVERY_STATUS_TONE[d.status] ?? 'neutral'}>{line.state}</Badge>
                                    {d.sentAt && <span className="tabular-nums text-content-muted">{fmt.dateTime(d.sentAt)}</span>}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </>
        )}
      </div>
      </RequirePermission>
    </AppShell>
  );
}
