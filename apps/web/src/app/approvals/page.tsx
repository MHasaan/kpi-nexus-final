'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Clock, ArrowRight } from 'lucide-react';

import { ApiError, getAccessToken, listRoles, meRequest, type RoleSummary } from '../../lib/api-client';
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
import { RequirePermission } from '../../components/auth/require-permission';
import { PageHeader, Card, CardContent, Button, Badge, EmptyState, Skeleton, Select, Input } from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';

const RESOLVED_STATUSES: ApprovalRequestStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="kn-eyebrow mb-3 mt-6">{children}</div>;
}

const RESOLVED_TONE: Record<string, 'success' | 'error' | 'neutral'> = {
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
};

/** Stringify a single payload value for display in a monospace diff cell. */
function formatValue(val: unknown): string {
  if (val === undefined) return '—';
  if (val === null) return 'null';
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
}

/** True when before/after represent the same value (deep-ish, via stable stringify). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return false;
}

/** Render the proposed payload as a key:value `+` add list (monospace diff) — used for creates. */
function ProposedChangesDiff({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object') {
    return (
      <pre className="overflow-x-auto rounded-md border border-border-divider bg-surface-1 px-3 py-2 font-mono text-xs text-content-strong">
        {formatValue(payload)}
      </pre>
    );
  }
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-content-muted">No changes in this request.</p>;
  }
  return (
    <div className="rounded-md border border-border-divider bg-surface-1 px-3 py-2 font-mono text-xs">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-2 text-status-positive">
          <span aria-hidden>+</span>
          <span className="text-content-muted">{key}:</span>
          <span className="break-all text-content-strong">{formatValue(val)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Render a true BEFORE→AFTER diff for an update request.
 * Iterates the union of current+proposed keys, showing only rows that actually changed:
 * the prior value (muted/critical) → the proposed value (positive).
 */
function BeforeAfterDiff({ current, proposed }: { current: unknown; proposed: unknown }) {
  const currentObj =
    current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  const proposedObj =
    proposed && typeof proposed === 'object' ? (proposed as Record<string, unknown>) : {};

  const keys = Array.from(new Set([...Object.keys(currentObj), ...Object.keys(proposedObj)]));
  const changed = keys.filter((key) => !valuesEqual(currentObj[key], proposedObj[key]));

  if (changed.length === 0) {
    return <p className="text-xs text-content-muted">No values changed in this request.</p>;
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border-divider bg-surface-1 px-3 py-2 font-mono text-xs">
      {changed.map((key) => (
        <div key={key} className="flex flex-wrap items-center gap-2">
          <span className="text-content-muted">{key}:</span>
          <span className="break-all rounded bg-status-critical-bg px-1.5 py-0.5 text-status-critical line-through">
            {formatValue(currentObj[key])}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-content-muted" aria-hidden />
          <span className="break-all rounded bg-status-success-bg px-1.5 py-0.5 text-status-positive">
            {formatValue(proposedObj[key])}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [resolved, setResolved] = useState<ApprovalRequest[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wf, pending, resolvedByStatus] = await Promise.all([
        listApprovalWorkflows(),
        listApprovalRequests({ status: 'PENDING' }),
        Promise.all(
          RESOLVED_STATUSES.map((status) => listApprovalRequests({ status }).catch((): ApprovalRequest[] => [])),
        ),
      ]);
      setWorkflows(wf);
      setRequests(pending);
      setResolved(resolvedByStatus.flat());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
    listRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
    meRequest()
      .then(({ user }) => setCurrentUserId(user.id))
      .catch(() => setCurrentUserId(null));
  }, [load, router]);

  const decide = async (reqId: string, decision: 'approve' | 'reject') => {
    try {
      const comment = comments[reqId]?.trim();
      await decideApprovalRequest(reqId, { decision, ...(comment ? { comment } : {}) });
      setComments((c) => {
        const next = { ...c };
        delete next[reqId];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record decision');
    }
  };

  const cancel = async (reqId: string) => {
    try {
      await cancelApprovalRequest(reqId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel request');
    }
  };

  const saveWorkflow = async (
    entityType: ApprovalEntityType,
    patch: { requiredApproverRoleIds?: string[]; requireAll?: boolean; isActive?: boolean },
  ) => {
    const existing = workflows.find((w) => w.entityType === entityType);
    try {
      const saved = await upsertApprovalWorkflow(entityType, {
        requiredApproverRoleIds: patch.requiredApproverRoleIds ?? existing?.requiredApproverRoleIds ?? [],
        requireAll: patch.requireAll ?? existing?.requireAll ?? false,
        isActive: patch.isActive ?? existing?.isActive ?? false,
      });
      setWorkflows((ws) => ws.map((w) => (w.entityType === entityType ? saved : w)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update workflow');
    }
  };

  return (
    <AppShell title="Approvals" crumbs={[{ label: 'Approvals' }]}>
      <PageHeader
        title="Approvals"
        subtitle="Govern which changes need sign-off — and decide what's pending"
        actions={
          <Badge tone="warning">
            <Clock className="h-3 w-3" aria-hidden />
            {requests.length} pending
          </Badge>
        }
      />

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="approvals-error"
        >
          {error}
        </p>
      )}

      <RequirePermission permission="ORG_SETTINGS">
        <SectionLabel>Workflow configuration</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="workflow-config">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-3 h-3 w-24" />
                </CardContent>
              </Card>
            ))
          ) : workflows.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-bg p-6 text-center text-sm text-content-muted sm:col-span-2 lg:col-span-3">
              No workflows configured.
            </p>
          ) : (
            workflows.map((wf) => {
              const roleId = wf.requiredApproverRoleIds[0] ?? '';
              return (
                <Card key={wf.entityType} data-testid={`workflow-${wf.entityType}`}>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-content-strong">{wf.entityType}</span>
                      <Badge tone={wf.isActive ? 'success' : 'neutral'}>{wf.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>

                    <label className="flex items-center justify-between gap-2 border-t border-border-divider pt-3 text-sm">
                      <span className="text-content-muted">Active</span>
                      <input
                        type="checkbox"
                        data-testid={`workflow-active-${wf.entityType}`}
                        checked={wf.isActive}
                        onChange={(e) => void saveWorkflow(wf.entityType, { isActive: e.target.checked })}
                        className="h-4 w-4 accent-accent-primary"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-content-muted">Approver role</span>
                      <Select
                        data-testid={`workflow-role-${wf.entityType}`}
                        value={roleId}
                        onChange={(e) =>
                          void saveWorkflow(wf.entityType, {
                            requiredApproverRoleIds: e.target.value ? [e.target.value] : [],
                          })
                        }
                      >
                        <option value="">No approver role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-content-muted">Require all approvers</span>
                      <input
                        type="checkbox"
                        data-testid={`workflow-require-all-${wf.entityType}`}
                        checked={wf.requireAll}
                        onChange={(e) => void saveWorkflow(wf.entityType, { requireAll: e.target.checked })}
                        className="h-4 w-4 accent-accent-primary"
                      />
                    </label>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </RequirePermission>

      <SectionLabel>Pending requests</SectionLabel>
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
        ) : requests.length === 0 ? (
          <EmptyState
            data-testid="pending-empty"
            title="All caught up"
            description="No requests are waiting on your decision."
          />
        ) : (
          requests.map((req) => {
            const isRequester = currentUserId !== null && req.requesterUserId === currentUserId;
            return (
              <Card key={req.id} data-testid={`request-${req.id}`}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-content-strong">{req.entityType}</div>
                      <div className="mt-1 text-xs text-content-muted">
                        Status: <span className="font-medium text-content">{req.status}</span> ·{' '}
                        <span className="text-accent-primary">you&apos;re an approver</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        data-testid={`approve-${req.id}`}
                        onClick={() => decide(req.id, 'approve')}
                        leftIcon={<Check className="h-3.5 w-3.5" aria-hidden />}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`reject-${req.id}`}
                        onClick={() => decide(req.id, 'reject')}
                        leftIcon={<X className="h-3.5 w-3.5" aria-hidden />}
                      >
                        Reject
                      </Button>
                      {isRequester && (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`cancel-${req.id}`}
                          onClick={() => cancel(req.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const hasBefore = req.currentPayload !== null && req.currentPayload !== undefined;
                    return (
                      <div data-testid={`approval-diff-${req.id}`}>
                        <div className="kn-eyebrow mb-1.5">
                          {hasBefore ? 'Before → after' : 'Proposed changes'}
                        </div>
                        {hasBefore ? (
                          <BeforeAfterDiff current={req.currentPayload} proposed={req.proposedPayload} />
                        ) : (
                          <ProposedChangesDiff payload={req.proposedPayload} />
                        )}
                      </div>
                    );
                  })()}

                  <Input
                    data-testid={`comment-${req.id}`}
                    value={comments[req.id] ?? ''}
                    onChange={(e) => setComments((c) => ({ ...c, [req.id]: e.target.value }))}
                    placeholder="Add a comment (optional)…"
                    aria-label="Decision comment"
                  />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <SectionLabel>Resolved requests</SectionLabel>
      <div className="space-y-3" data-testid="resolved-requests">
        {loading ? (
          <Card>
            <CardContent>
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        ) : resolved.length === 0 ? (
          <EmptyState title="No resolved requests" description="Decisions you've made will appear here." />
        ) : (
          resolved.map((req) => (
            <Card key={req.id} data-testid={`resolved-${req.id}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-content-strong">{req.entityType}</div>
                  <div className="mt-1 text-xs tabular-nums text-content-muted">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Badge tone={RESOLVED_TONE[req.status] ?? 'neutral'}>{req.status}</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
