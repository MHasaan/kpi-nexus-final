'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Pause, Pencil, Play, Trash2, Zap } from 'lucide-react';

import { ApiError, getAccessToken, listKpis } from '../../lib/api-client';
import { type Workflow, createWorkflow, deleteWorkflow, listWorkflows, triggerWorkflow, updateWorkflow } from '../../lib/collab-client';
import { AppShell } from '../../components/app-shell';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Input, Select, Label, Button, EmptyState, Skeleton, Badge } from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { RequirePermission } from '../../components/auth/require-permission';
import { useAsyncData } from '../../lib/use-async-data';
import { useConfirm } from '../../lib/use-confirm';
import { usePermissions } from '../../lib/use-permissions';
import { useToast } from '../../lib/use-toast';
import { EMPTY_WORKFLOW_FORM, OPERATORS, type WorkflowForm, describeWorkflow, formFromWorkflow, workflowBody, workflowFormProblem } from '../../lib/workflow-form';

/**
 * Automations: "when a KPI crosses a line, create a task". The page builds
 * that one kind; automations of other kinds (made through the API) are listed
 * and can be paused, run and deleted, but not edited here.
 */
export default function WorkflowsPage() {
  const router = useRouter();
  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  const workflows = useAsyncData(() => listWorkflows(), [], { enabled: allowed });
  // KPIs name the automations and fill the picker; without them the list still shows.
  const kpis = useAsyncData(() => listKpis().catch(() => []), [], { enabled: allowed });
  const confirm = useConfirm();
  const toast = useToast();

  const [form, setForm] = useState<WorkflowForm>(EMPTY_WORKFLOW_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
  }, [router]);

  const kpiName = (id: string) => kpis.data?.find((k) => k.id === id)?.name;
  const set = (key: keyof WorkflowForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const reset = () => {
    setForm(EMPTY_WORKFLOW_FORM);
    setEditingId(null);
    setFormError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const problem = workflowFormProblem(form);
    setFormError(problem);
    if (problem) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateWorkflow(editingId, workflowBody(form));
        toast.success('Automation saved');
      } else {
        await createWorkflow(workflowBody(form));
        toast.success('Automation created', 'It runs from the next value recorded for that KPI.');
      }
      reset();
      workflows.reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save this automation.');
    } finally {
      setSaving(false);
    }
  };

  /** Run one row action with its buttons busy; a failure is a toast, the row stays. */
  const act = async (wf: Workflow, action: () => Promise<unknown>, done: string, detail?: string) => {
    setBusyId(wf.id);
    try {
      await action();
      toast.success(done, detail);
      workflows.reload();
    } catch (e) {
      toast.error('That did not work', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const remove = (wf: Workflow) =>
    confirm({
      title: `Delete “${wf.name}”?`,
      description: 'It stops running. Tasks it already created are kept.',
      confirmLabel: 'Delete automation',
      tone: 'danger',
      testId: 'wf-delete-confirm',
      action: async () => {
        await deleteWorkflow(wf.id);
        if (editingId === wf.id) reset();
        workflows.reload();
        toast.success('Automation deleted');
      },
    });

  const edit = (wf: Workflow) => {
    const filled = formFromWorkflow(wf);
    if (!filled) return;
    setForm(filled);
    setEditingId(wf.id);
    setFormError(null);
    document.getElementById('wf-name-input')?.focus();
  };

  const rows = workflows.data ?? [];

  return (
    <AppShell title="Automations" crumbs={[{ label: 'Automation' }, { label: 'Workflows' }]}>
      {/* FE-014: same permission the page's API enforces — no broken 403 screens. */}
      <RequirePermission permission="ORG_SETTINGS">
        <PageHeader title="Automations" subtitle="When a KPI crosses a line you set, do something about it — without anyone having to notice first." />

        {workflows.error && (
          <p className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical" role="alert" data-testid="workflows-error">
            {workflows.error}{' '}
            <button type="button" className="font-medium underline" onClick={workflows.reload}>
              Try again
            </button>
          </p>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Edit automation' : 'New automation'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} noValidate className="space-y-3">
                <div>
                  <Label htmlFor="wf-name-input">Name</Label>
                  <Input id="wf-name-input" data-testid="wf-name" value={form.name} onChange={set('name')} placeholder="e.g. Celebrate a record month" disabled={saving} />
                </div>
                <div>
                  <Label htmlFor="wf-kpi-select">When this KPI</Label>
                  <Select id="wf-kpi-select" data-testid="wf-kpi" value={form.kpiId} onChange={set('kpiId')} disabled={saving || !kpis.data}>
                    <option value="">{kpis.data && kpis.data.length === 0 ? 'No KPIs yet — create one first' : 'Choose a KPI'}</option>
                    {(kpis.data ?? []).map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <div>
                    <Label htmlFor="wf-operator-select">Does this</Label>
                    <Select id="wf-operator-select" data-testid="wf-operator" value={form.operator} onChange={set('operator')} disabled={saving}>
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.words} ({o.symbol})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="wf-value-input">Value</Label>
                    <Input id="wf-value-input" data-testid="wf-value" type="number" step="any" value={form.value} onChange={set('value')} disabled={saving} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="wf-task-title-input">Create a task titled</Label>
                  <Input id="wf-task-title-input" data-testid="wf-task-title" value={form.taskTitle} onChange={set('taskTitle')} placeholder="e.g. Review with the team" disabled={saving} />
                </div>
                {formError && (
                  <p role="alert" data-testid="wf-form-error" className="text-sm text-status-critical">
                    {formError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" data-testid="wf-create" isLoading={saving} className="flex-1">
                    {editingId ? 'Save changes' : 'Create automation'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="secondary" onClick={reset} disabled={saving} data-testid="wf-cancel-edit">
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <div>
            <div className="kn-eyebrow mb-3">Your automations</div>
            <div className="space-y-3" data-testid="workflow-list">
              {workflows.loading && !workflows.data ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent>
                      <Skeleton className="h-4 w-56" />
                      <Skeleton className="mt-2 h-3 w-32" />
                    </CardContent>
                  </Card>
                ))
              ) : rows.length === 0 ? (
                <div data-testid="workflows-empty">
                  <EmptyState
                    icon={Activity}
                    title="No automations yet"
                    description="Make one on the left — for example: when Monthly Revenue goes above 100,000, create the task “Celebrate”."
                  />
                </div>
              ) : (
                rows.map((wf) => {
                  const busy = busyId === wf.id;
                  return (
                    <Card key={wf.id} data-testid={`workflow-${wf.id}`} className={wf.isActive ? undefined : 'opacity-70'}>
                      <CardContent className="flex flex-wrap items-center gap-3">
                        <Activity className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-content-strong">
                            {wf.name}
                            <Badge tone={wf.isActive ? 'success' : 'neutral'}>{wf.isActive ? 'On' : 'Paused'}</Badge>
                          </div>
                          <p className="text-xs text-content-muted">{describeWorkflow(wf, kpiName)}</p>
                          <p className="text-xs text-content-muted">{wf.lastRunAt ? `Last ran ${new Date(wf.lastRunAt).toLocaleString()}` : 'Has not run yet'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            data-testid="wf-run"
                            disabled={busy}
                            leftIcon={<Zap aria-hidden className="h-3.5 w-3.5" />}
                            onClick={() => void act(wf, () => triggerWorkflow(wf.id), 'Automation ran', 'Its action was carried out once.')}
                          >
                            Run now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="wf-toggle"
                            disabled={busy}
                            leftIcon={wf.isActive ? <Pause aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
                            onClick={() => void act(wf, () => updateWorkflow(wf.id, { isActive: !wf.isActive }), wf.isActive ? 'Automation paused' : 'Automation switched on')}
                          >
                            {wf.isActive ? 'Pause' : 'Switch on'}
                          </Button>
                          {formFromWorkflow(wf) && (
                            <Button size="sm" variant="ghost" data-testid="wf-edit" disabled={busy} leftIcon={<Pencil aria-hidden className="h-3.5 w-3.5" />} onClick={() => edit(wf)}>
                              Edit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="wf-delete"
                            disabled={busy}
                            className="text-status-critical hover:bg-status-critical-bg"
                            leftIcon={<Trash2 aria-hidden className="h-3.5 w-3.5" />}
                            onClick={() => void remove(wf)}
                          >
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </RequirePermission>
    </AppShell>
  );
}
