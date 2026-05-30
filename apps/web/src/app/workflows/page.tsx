'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import { type Workflow, createWorkflow, deleteWorkflow, listWorkflows } from '../../lib/collab-client';

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [kpiId, setKpiId] = useState('');
  const [operator, setOperator] = useState('>');
  const [value, setValue] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  const load = useCallback(async () => {
    try {
      setWorkflows(await listWorkflows());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load workflows');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const create = async () => {
    if (!name.trim() || !taskTitle.trim()) return;
    try {
      await createWorkflow({
        name: name.trim(),
        triggers: ['kpi_changed'],
        rule: kpiId ? { kind: 'kpi_value', kpiId, operator, value: Number(value) || 0 } : null,
        action: { kind: 'create_task', title: taskTitle.trim() },
        isActive: true,
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

  const remove = async (id: string) => {
    try {
      await deleteWorkflow(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete workflow');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Automations</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Workflow automations</h1>
        <p className="mt-1 text-sm text-content-muted">If a KPI changes and the rule matches, run an action.</p>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="workflows-error">{error}</p>}

        <div className="mt-5 rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-sm font-semibold text-content-strong">New automation</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input data-testid="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="wf-task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title to create" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <input data-testid="wf-kpi-id" value={kpiId} onChange={(e) => setKpiId(e.target.value)} placeholder="KPI id (rule)" className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            <div className="flex gap-2">
              <select data-testid="wf-operator" value={operator} onChange={(e) => setOperator(e.target.value)} className="rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong">
                {['>', '<', '>=', '<=', '==', '!='].map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <input data-testid="wf-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" type="number" className="flex-1 rounded border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong" />
            </div>
          </div>
          <button type="button" data-testid="wf-create" onClick={create} className="mt-3 rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Create automation</button>
        </div>

        <div className="mt-6 space-y-2" data-testid="workflow-list">
          {workflows.map((w) => (
            <div key={w.id} data-testid={`wf-${w.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-4">
              <div>
                <p className="font-medium text-content-strong">{w.name}</p>
                <p className="text-xs text-content-muted">
                  {w.triggers.join(', ')} · {w.isActive ? 'active' : 'inactive'}
                  {w.lastRunAt ? ` · last run ${new Date(w.lastRunAt).toLocaleString()}` : ''}
                </p>
              </div>
              <button type="button" aria-label="Delete" onClick={() => remove(w.id)} className="text-content-muted hover:text-status-critical">×</button>
            </div>
          ))}
          {workflows.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="workflows-empty">No automations yet.</p>}
        </div>
      </div>
    </main>
  );
}
