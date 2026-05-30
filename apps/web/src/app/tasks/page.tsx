'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import {
  type Task,
  type TaskStatus,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from '../../lib/collab-client';

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'BLOCKED', label: 'Blocked' },
  { status: 'DONE', label: 'Done' },
  { status: 'CANCELLED', label: 'Cancelled' },
];

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load tasks');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const onDrop = async (taskId: string, status: TaskStatus) => {
    const prev = tasks;
    // Optimistic flip.
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await updateTask(taskId, { status });
    } catch (e) {
      setTasks(prev); // rollback
      setError(e instanceof ApiError ? e.message : 'Could not move task');
    }
  };

  const quickCreate = async (status: TaskStatus) => {
    const title = (drafts[status] ?? '').trim();
    if (!title) return;
    setDrafts((d) => ({ ...d, [status]: '' }));
    try {
      const created = await createTask({ title, status });
      setTasks((ts) => [...ts, created]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create task');
    }
  };

  const remove = async (id: string) => {
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof ApiError ? e.message : 'Could not delete task');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Tasks</span>
          <Link href="/okrs" className="ml-auto text-sm text-content-muted hover:text-accent-primary">OKRs</Link>
          <Link href="/approvals" className="text-sm text-content-muted hover:text-accent-primary">Approvals</Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Task board</h1>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="tasks-error">{error}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-5" data-testid="kanban">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              data-testid={`column-${col.status}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) void onDrop(id, col.status);
              }}
              className="flex min-h-[200px] flex-col rounded-lg border border-border bg-surface-1 p-3"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                {col.label} ({tasks.filter((t) => t.status === col.status).length})
              </h2>

              <div className="mt-3 flex-1 space-y-2">
                {tasks
                  .filter((t) => t.status === col.status)
                  .map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                      data-testid={`task-${t.id}`}
                      className="group cursor-grab rounded-md border border-border bg-surface-bg p-2 text-sm text-content-strong shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span data-testid="task-title">{t.title}</span>
                        <button
                          type="button"
                          aria-label="Delete task"
                          onClick={() => void remove(t.id)}
                          className="opacity-0 transition group-hover:opacity-100 text-content-muted hover:text-status-critical"
                        >
                          ×
                        </button>
                      </div>
                      <span className="mt-1 inline-block text-[10px] uppercase text-content-muted">{t.priority}</span>
                    </div>
                  ))}
              </div>

              <form
                className="mt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void quickCreate(col.status);
                }}
              >
                <input
                  data-testid={`quick-add-${col.status}`}
                  value={drafts[col.status] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [col.status]: e.target.value }))}
                  placeholder="+ Add task"
                  className="w-full rounded border border-border bg-surface-bg px-2 py-1 text-xs text-content-strong placeholder:text-content-muted"
                />
              </form>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
