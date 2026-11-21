'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Clock, X } from 'lucide-react';

import { ApiError, getAccessToken, listRoles, meRequest } from '../../lib/api-client';
import {
  type ApprovalEntityType,
  type ApprovalRequest,
  type ApprovalRequestStatus,
  type ApprovalWorkflow,
  cancelApprovalRequest,
  decideApprovalRequest,
  listApprovalRequests,
  listApprovalWorkflows,
  upsertApprovalWorkflow,
} from '../../lib/collab-client';
import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Skeleton } from '../../components/ui';
import { APPROVAL_KINDS, type WorkflowSetting, kindLabel, requestStanding, statusLabel, toggleApproverRole, workflowProblem, workflowSettings } from '../../lib/approvals-view';
import { type ChangeRow, approvalChanges } from '../../lib/approval-changes';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { useAsyncData } from '../../lib/use-async-data';
import { useConfirm } from '../../lib/use-confirm';
import { usePermissions } from '../../lib/use-permissions';
import { useToast } from '../../lib/use-toast';
import { useFormat } from '../../lib/format-context';
import { inSentence } from '../../lib/sentence-case';

const RESOLVED_STATUSES: ApprovalRequestStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="kn-eyebrow mb-3 mt-6">{children}</div>;
}

/** "KPI change · Churn" — the kind in words and the thing it is about by name. */
function RequestTitle({ request }: { request: ApprovalRequest }) {
  return (
    <div className="text-sm font-semibold text-content-strong">
      {kindLabel(request.entityType)}
      {request.entityLabel ? <span className="font-normal text-content"> · {request.entityLabel}</span> : null}
    </div>
  );
}

const RESOLVED_TONE: Record<string, 'success' | 'error' | 'neutral'> = {
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
};

/**
 * What the request asks for, in words: only the fields that change, each with
 * what it is now and what it would become. The stored request (`dto`, `kind`,
 * record ids) is never shown.
 */
function ChangeList({ rows }: { rows: ChangeRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-content-muted">Nothing would change.</p>;
  }
  return (
    <dl className="space-y-1.5 rounded-md border border-border-divider bg-surface-1 px-3 py-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center gap-2">
          <dt className="text-content-muted">{row.label}</dt>
          {row.before !== undefined && (
            <>
              <dd className="break-words rounded bg-status-critical-bg px-1.5 py-0.5 text-status-critical line-through">
                <span className="sr-only">was </span>
                {row.before}
              </dd>
              <ArrowRight className="h-3 w-3 shrink-0 text-content-muted" aria-hidden />
            </>
          )}
          <dd className="break-words font-medium text-content-strong">{row.after}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The approvals inbox. Everyone who can see KPIs gets it: approvers decide,
 * requesters watch (and can cancel) their own. Setting up which changes need
 * approval is for administrators and is only asked for when the viewer may see it —
 * asking first, for everyone, used to turn the inbox into an error page (UI-008).
 */
export default function ApprovalsPage() {
  const fmt = useFormat();
  // A target's dates are calendar days: written as the organisation writes dates, never shifted by its timezone.
  const changeFormat = { number: (value: number) => fmt.number(value), date: (iso: string) => fmt.day(iso) };
  const router = useRouter();
  const signedIn = typeof window !== 'undefined' && Boolean(getAccessToken());
  const { ready, has } = usePermissions();
  const canConfigure = ready && has('ORG_SETTINGS');
  const toast = useToast();
  const confirm = useConfirm();

  const inbox = useAsyncData(
    async () => {
      const [pending, ...resolved] = await Promise.all([
        listApprovalRequests({ status: 'PENDING' }),
        ...RESOLVED_STATUSES.map((status) => listApprovalRequests({ status })),
      ]);
      return {
        pending,
        resolved: resolved.flat().sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
      };
    },
    [],
    { enabled: signedIn },
  );
  const me = useAsyncData(() => meRequest(), [], { enabled: signedIn });
  const config = useAsyncData(
    async () => {
      const [saved, roles] = await Promise.all([listApprovalWorkflows(), listRoles()]);
      return { saved, roles };
    },
    [],
    { enabled: signedIn && canConfigure },
  );

  // Saved workflows, kept in step with each save without reloading the section.
  const [savedWorkflows, setSavedWorkflows] = useState<ApprovalWorkflow[] | null>(null);
  const [savingKind, setSavingKind] = useState<ApprovalEntityType | null>(null);
  const [kindError, setKindError] = useState<Partial<Record<ApprovalEntityType, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
  }, [router]);

  const currentUserId = me.data?.user.id ?? null;
  const settings = workflowSettings(savedWorkflows ?? config.data?.saved ?? []);
  const pending = inbox.data?.pending ?? [];
  const resolved = inbox.data?.resolved ?? [];
  const waitingOnMe = pending.filter((r) => r.canDecide).length;

  const saveWorkflow = async (current: WorkflowSetting, patch: Partial<WorkflowSetting>) => {
    const next = { ...current, ...patch };
    const problem = workflowProblem(next);
    setKindError((errors) => ({ ...errors, [current.entityType]: problem ?? undefined }));
    if (problem) return;
    // Shown at once, so a tick looks ticked; put back if the save fails.
    const before = savedWorkflows ?? config.data?.saved ?? [];
    const others = before.filter((w) => w.entityType !== current.entityType);
    const existingId = before.find((w) => w.entityType === current.entityType)?.id ?? '';
    setSavedWorkflows([...others, { id: existingId, ...next }]);
    setSavingKind(current.entityType);
    try {
      const saved = await upsertApprovalWorkflow(current.entityType, {
        requiredApproverRoleIds: next.requiredApproverRoleIds,
        requireAll: next.requireAll,
        isActive: next.isActive,
      });
      setSavedWorkflows([...others, saved]);
    } catch (e) {
      setSavedWorkflows(before);
      toast.error('That was not saved', e instanceof ApiError ? e.message : undefined);
    } finally {
      setSavingKind(null);
    }
  };

  const act = async (request: ApprovalRequest, action: 'approve' | 'reject' | 'cancel') => {
    if (action === 'cancel') {
      const ok = await confirm({
        title: 'Cancel this request?',
        description: 'The change will not be made. You can ask again by making the change once more.',
        confirmLabel: 'Cancel request',
        cancelLabel: 'Keep it',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(request.id);
    try {
      if (action === 'cancel') {
        await cancelApprovalRequest(request.id);
        toast.success('Request cancelled');
      } else {
        const comment = comments[request.id]?.trim();
        const result = await decideApprovalRequest(request.id, { decision: action, ...(comment ? { comment } : {}) });
        if (action === 'reject') toast.success('Rejected', 'The change was not made.');
        else if (result.status === 'APPROVED') toast.success('Approved', 'The change has been made.');
        else toast.success('Approved', 'Recorded. It still needs another approver before the change is made.');
        setComments(({ [request.id]: _done, ...rest }) => rest);
      }
      inbox.reload();
    } catch (e) {
      toast.error('That did not work', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const loading = inbox.loading && !inbox.data;

  return (
    <AppShell title="Approvals" crumbs={[{ label: 'Execute' }]}>
      <PageHeader
        title="Approvals"
        subtitle="Changes waiting for sign-off, and what was decided"
        actions={
          <Badge tone={waitingOnMe > 0 ? 'warning' : 'neutral'} data-testid="approvals-waiting">
            <Clock className="h-3 w-3" aria-hidden />
            {waitingOnMe} waiting for you
          </Badge>
        }
      />

      {inbox.error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="approvals-error"
        >
          {inbox.error}{' '}
          <button type="button" className="underline" onClick={inbox.reload}>
            Try again
          </button>
        </p>
      )}

      {canConfigure && (
        <>
          <SectionLabel>What needs approval</SectionLabel>
          {config.error ? (
            <p className="rounded-lg border border-border bg-surface-bg p-4 text-sm text-status-critical" role="alert" data-testid="workflow-config-error">
              {config.error}{' '}
              <button type="button" className="underline" onClick={config.reload}>
                Try again
              </button>
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="workflow-config">
              {!config.data
                ? APPROVAL_KINDS.map((kind) => (
                    <Card key={kind.entityType}>
                      <CardContent>
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-3 h-3 w-24" />
                      </CardContent>
                    </Card>
                  ))
                : settings.map((setting) => {
                    const kind = APPROVAL_KINDS.find((k) => k.entityType === setting.entityType)!;
                    const saving = savingKind === setting.entityType;
                    const problem = kindError[setting.entityType];
                    return (
                      <Card key={setting.entityType} data-testid={`workflow-${setting.entityType}`}>
                        <CardContent className="flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-content-strong">{kind.title}</span>
                            <Badge tone={setting.isActive ? 'success' : 'neutral'}>{setting.isActive ? 'On' : 'Off'}</Badge>
                          </div>
                          <p className="text-xs text-content-muted">{kind.about}</p>

                          <fieldset className="flex flex-col gap-1.5 border-t border-border-divider pt-3 text-sm" disabled={saving}>
                            {/* First letter down, the rest as written: lower-casing it whole made "KPI" a word, "kpi". */}
                            <legend className="sr-only">Who can approve {inSentence(kind.title)}</legend>
                            <span className="text-content-muted">Who can approve</span>
                            {(config.data?.roles ?? []).map((role) => (
                              <label key={role.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  data-testid={`workflow-${setting.entityType}-role-${role.name}`}
                                  checked={setting.requiredApproverRoleIds.includes(role.id)}
                                  onChange={() =>
                                    void saveWorkflow(setting, {
                                      requiredApproverRoleIds: toggleApproverRole(setting.requiredApproverRoleIds, role.id),
                                    })
                                  }
                                  className="h-4 w-4 accent-accent-primary"
                                />
                                <span>{role.name}</span>
                              </label>
                            ))}
                          </fieldset>

                          <label className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-content-muted">Every chosen role must approve</span>
                            <input
                              type="checkbox"
                              data-testid={`workflow-require-all-${setting.entityType}`}
                              checked={setting.requireAll}
                              disabled={saving}
                              onChange={(e) => void saveWorkflow(setting, { requireAll: e.target.checked })}
                              className="h-4 w-4 accent-accent-primary"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-2 border-t border-border-divider pt-3 text-sm">
                            <span className="font-medium text-content-strong">Require approval</span>
                            <input
                              type="checkbox"
                              data-testid={`workflow-active-${setting.entityType}`}
                              checked={setting.isActive}
                              disabled={saving}
                              onChange={(e) => void saveWorkflow(setting, { isActive: e.target.checked })}
                              className="h-4 w-4 accent-accent-primary"
                            />
                          </label>
                          {problem && (
                            <p className="text-xs text-status-critical" role="alert" data-testid={`workflow-problem-${setting.entityType}`}>
                              {problem}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
            </div>
          )}
        </>
      )}

      <SectionLabel>Waiting</SectionLabel>
      <div className="space-y-3" data-testid="pending-requests">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-3 h-8 w-40" />
              </CardContent>
            </Card>
          ))
        ) : pending.length === 0 ? (
          <div data-testid="pending-empty">
            <EmptyState title="Nothing is waiting" description="Changes that need approval will appear here." />
          </div>
        ) : (
          pending.map((req) => {
            const standing = requestStanding(req, currentUserId);
            // Their own request — also when, as a sole administrator, they may decide it.
            const mine = currentUserId !== null && req.requesterUserId === currentUserId;
            const busy = busyId === req.id;
            const hasBefore = req.currentPayload !== null && req.currentPayload !== undefined;
            return (
              <Card key={req.id} data-testid={`request-${req.id}`}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <RequestTitle request={req} />
                      <div className="mt-1 text-xs text-content-muted">
                        Asked by {mine ? 'you' : (req.requesterName ?? 'someone who has left')} on{' '}
                        {fmt.date(req.createdAt)} ·{' '}
                        {standing === 'decide' ? (
                          <span className="text-accent-primary">Waiting for your decision</span>
                        ) : (
                          <span>Waiting for an approver</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {standing === 'decide' && (
                        <>
                          <Button
                            size="sm"
                            data-testid={`approve-${req.id}`}
                            disabled={busy}
                            onClick={() => void act(req, 'approve')}
                            leftIcon={<Check className="h-3.5 w-3.5" aria-hidden />}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            data-testid={`reject-${req.id}`}
                            disabled={busy}
                            onClick={() => void act(req, 'reject')}
                            leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {mine && (
                        <Button size="sm" variant="ghost" data-testid={`cancel-${req.id}`} disabled={busy} onClick={() => void act(req, 'cancel')}>
                          Cancel request
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* A sole administrator may decide their own request: say why the buttons are there. */}
                  {standing === 'decide' && mine && (
                    <p data-testid={`own-request-note-${req.id}`} className="text-xs text-content-muted">
                      You asked for this change, and nobody else can approve it, so as an administrator you may decide it
                      yourself. The decision is recorded as one made on your own request.
                    </p>
                  )}

                  <div data-testid={`approval-diff-${req.id}`}>
                    <div className="kn-eyebrow mb-1.5">{hasBefore ? 'What would change' : 'What is asked for'}</div>
                    <ChangeList rows={approvalChanges(req.proposedPayload, req.currentPayload, changeFormat)} />
                  </div>

                  {standing === 'decide' && (
                    <Input
                      data-testid={`comment-${req.id}`}
                      value={comments[req.id] ?? ''}
                      onChange={(e) => setComments((c) => ({ ...c, [req.id]: e.target.value }))}
                      placeholder="Add a comment (optional)…"
                      aria-label="Decision comment"
                    />
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <SectionLabel>Decided</SectionLabel>
      <div className="space-y-3" data-testid="resolved-requests">
        {loading ? (
          <Card>
            <CardContent>
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        ) : resolved.length === 0 ? (
          <EmptyState title="Nothing decided yet" description="Approved, rejected and cancelled requests are kept here." />
        ) : (
          resolved.map((req) => (
            <Card key={req.id} data-testid={`resolved-${req.id}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <RequestTitle request={req} />
                  <div className="mt-1 text-xs tabular-nums text-content-muted">
                    Asked by {req.requesterName ?? 'someone who has left'} on {fmt.date(req.createdAt)}
                  </div>
                </div>
                <Badge tone={RESOLVED_TONE[req.status] ?? 'neutral'}>{statusLabel(req.status)}</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
