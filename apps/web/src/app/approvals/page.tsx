'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, type RoleSummary, getAccessToken, listRoles } from '../../lib/api-client';
import {
  type ApprovalEntityType,
  type ApprovalRequest,
  type ApprovalWorkflow,
  decideApprovalRequest,
  listApprovalRequests,
  listApprovalWorkflows,
  upsertApprovalWorkflow,
} from '../../lib/collab-client';

const ENTITY_TYPES: ApprovalEntityType[] = ['KPI_DEFINITION', 'KPI_TARGET', 'ROLE_PERMISSIONS'];

export default function ApprovalsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [wfs, reqs, rs] = await Promise.all([
        listApprovalWorkflows().catch(() => []),
        listApprovalRequests().catch(() => []),
        listRoles().catch(() => []),
      ]);
      setWorkflows(wfs);
      setRequests(reqs);
      setRoles(rs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load approvals');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const wfFor = (et: ApprovalEntityType) => workflows.find((w) => w.entityType === et);

  const toggle = async (et: ApprovalEntityType, roleId: string, isActive: boolean) => {
    try {
      await upsertApprovalWorkflow(et, { requiredApproverRoleIds: roleId ? [roleId] : [], isActive });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save workflow');
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await decideApprovalRequest(id, { decision });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record decision');
    }
  };

  const pending = requests.filter((r) => r.status === 'PENDING');
  const resolved = requests.filter((r) => r.status !== 'PENDING');

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Approvals</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {error && <p className="mb-3 text-sm text-status-critical" data-testid="approvals-error">{error}</p>}

        {/* Workflow config */}
        <section>
          <h1 className="text-2xl font-semibold text-content-strong">Approval workflows</h1>
          <div className="mt-4 space-y-3" data-testid="workflow-config">
            {ENTITY_TYPES.map((et) => {
              const wf = wfFor(et);
              return (
                <div key={et} data-testid={`workflow-${et}`} className="rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-content-strong">{et}</span>
                    <label className="flex items-center gap-2 text-sm text-content-muted">
                      <input
                        type="checkbox"
                        data-testid={`workflow-active-${et}`}
                        checked={wf?.isActive ?? false}
                        onChange={(e) => toggle(et, wf?.requiredApproverRoleIds[0] ?? roles[0]?.id ?? '', e.target.checked)}
                      />
                      Active
                    </label>
                  </div>
                  <select
                    data-testid={`workflow-role-${et}`}
                    value={wf?.requiredApproverRoleIds[0] ?? ''}
                    onChange={(e) => toggle(et, e.target.value, wf?.isActive ?? false)}
                    className="mt-2 rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
                  >
                    <option value="">Select approver role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending requests */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-content-strong">Pending requests</h2>
          <div className="mt-3 space-y-2" data-testid="pending-requests">
            {pending.map((r) => (
              <div key={r.id} data-testid={`request-${r.id}`} className="rounded-lg border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-strong">{r.entityType} · {r.entityId}</span>
                  <div className="flex gap-2">
                    <button type="button" data-testid={`approve-${r.id}`} onClick={() => decide(r.id, 'approve')} className="rounded bg-status-positive px-3 py-1 text-xs font-medium text-white hover:opacity-90">Approve</button>
                    <button type="button" data-testid={`reject-${r.id}`} onClick={() => decide(r.id, 'reject')} className="rounded bg-status-critical px-3 py-1 text-xs font-medium text-white hover:opacity-90">Reject</button>
                  </div>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-surface-bg p-2 text-[11px] text-content-muted">{JSON.stringify(r.proposedPayload, null, 2)}</pre>
              </div>
            ))}
            {pending.length === 0 && <p className="text-sm text-content-muted" data-testid="pending-empty">No pending requests.</p>}
          </div>
        </section>

        {resolved.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-content-strong">Resolved</h2>
            <div className="mt-3 space-y-2" data-testid="resolved-requests">
              {resolved.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-3 text-sm">
                  <span className="text-content-strong">{r.entityType} · {r.entityId}</span>
                  <span className="text-content-muted">{r.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
