'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, X } from 'lucide-react';

import { ApiError, getAccessToken } from '../../lib/api-client';
import {
  type Workflow,
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
} from '../../lib/collab-client';
import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Select,
  Label,
  Button,
  EmptyState,
  Skeleton,
} from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { RequirePermission } from '../../components/auth/require-permission';
import { usePermissions } from '../../lib/use-permissions';

function summarizeRule(rule: unknown): string | null {
  if (!rule || typeof rule !== 'object') return null;
  const r = rule as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.kpiId === 'string' && r.kpiId) parts.push(`KPI ${r.kpiId}`);
  if (typeof r.operator === 'string' && r.operator) parts.push(r.operator);
  if (typeof r.threshold === 'number') parts.push(String(r.threshold));
  return parts.length ? parts.join(' ') : null;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kpiId, setKpiId] = useState('');
  const [op, setOp] = useState('GT');
  const [value, setValue] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkflows(await listWorkflows());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

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
    void load();
  }, [load, router, allowed]);

  const create = async () => {
    if (!name.trim() || !kpiId.trim()) return;
    try {
      await createWorkflow({
        name: name.trim(),
        triggers: ['KPI_CHANGE'],
        rule: { kpiId: kpiId.trim(), operator: op, threshold: Number(value) || 0 },
        action: { type: 'CREATE_TASK', taskTitle: taskTitle.trim() || 'Follow up' },
      });
      setName('');
      setKpiId('');
      setValue('');
      setTaskTitle('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create workflow');
    }
  };

  const remove = async (wfId: string) => {
    try {
      await deleteWorkflow(wfId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete workflow');
    }
  };

  return (
    <AppShell title="Automations" crumbs={[{ label: 'Automation' }, { label: 'Workflows' }]}>
      {/* FE-014: same permission the page's API enforces — no broken 403 screens. */}
      <RequirePermission permission="ORG_SETTINGS">
      <PageHeader
        title="Automations"
        subtitle="When a KPI changes and a rule matches, run an action"
      />

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="workflows-error"
        >
          {error}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <PermissionGuard permission="ORG_SETTINGS">
          <Card>
            <CardHeader>
              <CardTitle>New automation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="wf-name-input">Name</Label>
                <Input id="wf-name-input" data-testid="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
              </div>
              <div className="kn-eyebrow pt-1">Trigger → condition → action</div>
              <div className="flex gap-2">
                <Input data-testid="wf-kpi-id" value={kpiId} onChange={(e) => setKpiId(e.target.value)} placeholder="KPI id" className="flex-1" />
                <Select data-testid="wf-operator" value={op} onChange={(e) => setOp(e.target.value)} className="w-20">
                  <option value="GT">&gt;</option>
                  <option value="LT">&lt;</option>
                  <option value="GTE">≥</option>
                  <option value="LTE">≤</option>
                  <option value="EQ">=</option>
                </Select>
                <Input data-testid="wf-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="w-24" />
              </div>
              <div>
                <Label htmlFor="wf-task-title-input">Then create task titled…</Label>
                <Input id="wf-task-title-input" data-testid="wf-task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow up" />
              </div>
              <Button data-testid="wf-create" onClick={create} className="w-full">
                Create automation
              </Button>
            </CardContent>
          </Card>
        </PermissionGuard>

        <div>
          <div className="kn-eyebrow mb-3">Active automations</div>
          <div className="space-y-3" data-testid="workflow-list">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent>
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="mt-2 h-3 w-32" />
                  </CardContent>
                </Card>
              ))
            ) : workflows.length === 0 ? (
              <EmptyState
                icon={Activity}
                data-testid="workflows-empty"
                title="No automations yet"
                description="Create a rule like “When MRR > 100000, create task 'Celebrate'”."
              />
            ) : (
              workflows.map((wf) => (
                <Card key={wf.id} data-testid={`workflow-${wf.id}`}>
                  <CardContent className="flex items-center gap-3">
                    <Activity className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-content-strong">{wf.name}</div>
                      <p className="truncate text-xs text-content-muted">
                        {[
                          wf.triggers.length ? wf.triggers.join(', ') : null,
                          summarizeRule(wf.rule),
                          wf.lastRunAt ? `last run ${new Date(wf.lastRunAt).toLocaleDateString()}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || (wf.isActive ? 'Active' : 'Inactive')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(wf.id)}
                      className="shrink-0 rounded p-1 text-content-muted transition-colors hover:text-status-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Delete workflow"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
      </RequirePermission>
    </AppShell>
  );
}
