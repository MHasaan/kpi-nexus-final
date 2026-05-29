'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createKpiCategory,
  deleteKpiCategory,
  getAccessToken,
  listKpiCategories,
  type KpiCategory,
} from '../../../lib/api-client';

export default function KpiCategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<KpiCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setCategories(await listKpiCategories());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load categories');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createKpiCategory({ name: name.trim(), color: color.trim() || undefined });
      setName('');
      setColor('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create category');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setLoadError(null);
    try {
      await deleteKpiCategory(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to delete category');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">← KPIs</Link>
          <nav className="text-sm"><span className="font-medium text-content-strong">Categories</span></nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="categories-heading">KPI categories</h1>

        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
          <h2 className="text-lg font-semibold text-content-strong">Add category</h2>
          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3" data-testid="category-create-form">
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="category-name-input" className="mt-1 w-56 rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Color <span className="text-content-muted">(optional)</span></span>
              <input value={color} onChange={(e) => setColor(e.target.value)} data-testid="category-color-input" placeholder="#4f46e5" className="mt-1 w-32 rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            </label>
            <button type="submit" disabled={creating} data-testid="category-create-submit" className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50">
              {creating ? 'Adding…' : 'Add'}
            </button>
          </form>
          {createError && <p role="alert" data-testid="category-create-error" className="mt-3 text-sm text-status-critical">{createError}</p>}
        </section>

        {loadError && <div role="alert" data-testid="categories-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        {categories && categories.length === 0 && <div data-testid="categories-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">No categories yet.</div>}
        {categories && categories.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="categories-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Color</th><th className="px-4 py-2">KPIs</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} data-testid={`category-row-${c.id}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-content-strong">{c.name}</td>
                    <td className="px-4 py-3">{c.color ? <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />{c.color}</span> : <span className="text-content-muted">—</span>}</td>
                    <td className="px-4 py-3 text-content-muted">{c._count.kpis}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void handleDelete(c.id)} disabled={busyId === c.id} data-testid={`category-delete-${c.id}`} className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
