'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  getAccessToken,
  instantiateTemplate,
  listTemplates,
  type KpiTemplate,
} from '../../../lib/api-client';

const FUNCTIONS = ['', 'finance', 'sales', 'marketing', 'ops', 'hr', 'support', 'engineering'] as const;

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [fn, setFn] = useState('');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    listTemplates({ function: fn || undefined, search: search || undefined })
      .then(setTemplates)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [fn, search]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const instantiate = async (t: KpiTemplate) => {
    setErr(null);
    setMsg(null);
    try {
      const kpi = await instantiateTemplate(t.id);
      setMsg(`Created "${kpi.name}" (DRAFT)`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to instantiate');
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    load();
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Template gallery</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">KPI Templates</h1>
        <p className="mt-1 text-sm text-content-muted">Start from a curated metric and instantiate it into your organization as a draft.</p>

        <form onSubmit={onSearch} className="mt-6 flex flex-wrap items-end gap-3">
          <label><span className="block text-xs text-content-muted">Function</span>
            <select value={fn} onChange={(e) => setFn(e.target.value)} className="mt-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" data-testid="tmpl-function">
              {FUNCTIONS.map((f) => <option key={f} value={f}>{f || 'All functions'}</option>)}
            </select>
          </label>
          <label className="flex-1"><span className="block text-xs text-content-muted">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="revenue, churn, …" className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" data-testid="tmpl-search" /></label>
          <button className="rounded-md border border-border px-4 py-2 text-sm text-content-strong hover:bg-surface-1" data-testid="tmpl-search-btn">Search</button>
        </form>

        {msg && <p className="mt-4 rounded-md border border-status-positive/40 bg-status-positive/10 px-4 py-2 text-sm text-status-positive" data-testid="tmpl-msg">{msg}</p>}
        {err && <p className="mt-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-2 text-sm text-status-critical">{err}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="tmpl-grid">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-lg border border-border bg-surface-1 p-5">
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-content-strong">{t.name}</h3>
                {t.scorecardQuadrant && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-content-muted">{t.scorecardQuadrant}</span>}
              </div>
              <p className="mt-1 flex-1 text-sm text-content-muted">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.function && <span className="rounded bg-surface-bg px-1.5 py-0.5 text-xs text-content-muted">{t.function}</span>}
                {t.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-surface-bg px-1.5 py-0.5 text-xs text-content-muted">{tag}</span>)}
              </div>
              <button onClick={() => instantiate(t)} className="mt-4 rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white" data-testid={`tmpl-use-${t.slug}`}>Use template</button>
            </div>
          ))}
          {templates.length === 0 && <p className="text-content-muted">No templates match.</p>}
        </div>
      </div>
    </main>
  );
}
