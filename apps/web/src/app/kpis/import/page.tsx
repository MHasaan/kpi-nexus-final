'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  importKpisCommit,
  importKpisDryRun,
  type KpiImportDryRun,
} from '../../../lib/api-client';

const SAMPLE = `KPI Name,Type,Direction,Target,Tags
Monthly Recurring Revenue,CURRENCY,HIGHER_IS_BETTER,50000,finance;growth
Net Promoter Score,NUMBER,HIGHER_IS_BETTER,40,cx
Churn Rate,PERCENTAGE,LOWER_IS_BETTER,5,retention`;

export default function KpiImportPage() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<KpiImportDryRun | null>(null);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  async function handleDryRun() {
    setRunning(true);
    setError(null);
    setDone(null);
    try {
      setResult(await importKpisDryRun(csv));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Dry-run failed');
    } finally {
      setRunning(false);
    }
  }

  async function handleCommit() {
    setCommitting(true);
    setError(null);
    try {
      const { createdCount } = await importKpisCommit(csv);
      setDone(`Imported ${createdCount} KPI${createdCount === 1 ? '' : 's'}.`);
      setResult(null);
      setCsv('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  }

  const canCommit = result !== null && result.errors.length === 0 && result.valid.length > 0;

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">← KPIs</Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-semibold text-content-strong" data-testid="kpi-import-heading">Bulk import KPIs</h1>
        <p className="mb-6 text-sm text-content-muted">
          Paste CSV with a header row. Columns are matched case-insensitively
          (e.g. <code>KPI Name</code>, <code>Target</code>, <code>Type</code>). Run a dry-run to
          validate, then commit. Creates ORG_WIDE KPIs.
        </p>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          data-testid="kpi-import-textarea"
          placeholder={SAMPLE}
          className="w-full rounded-md border border-border bg-surface-bg px-3 py-2 font-mono text-xs text-content-strong shadow-sm"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => setCsv(SAMPLE)} data-testid="kpi-import-sample" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs hover:bg-surface-2">Load sample</button>
          <button type="button" onClick={() => void handleDryRun()} disabled={running || csv.trim() === ''} data-testid="kpi-import-dryrun" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50">
            {running ? 'Validating…' : 'Dry-run'}
          </button>
          <button type="button" onClick={() => void handleCommit()} disabled={!canCommit || committing} data-testid="kpi-import-commit" className="rounded-md bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50">
            {committing ? 'Importing…' : 'Commit import'}
          </button>
        </div>

        {error && <div role="alert" data-testid="kpi-import-error" className="mt-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{error}</div>}
        {done && <div role="status" data-testid="kpi-import-done" className="mt-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-3 text-sm text-status-success">{done}</div>}

        {result && (
          <section className="mt-6" data-testid="kpi-import-result">
            <div className="flex gap-4 text-sm">
              <span data-testid="kpi-import-valid-count" className="rounded-md border border-status-success/40 bg-status-success/10 px-3 py-1 text-status-success">{result.valid.length} valid</span>
              <span data-testid="kpi-import-error-count" className={`rounded-md border px-3 py-1 ${result.errors.length > 0 ? 'border-status-critical/40 bg-status-critical/10 text-status-critical' : 'border-border text-content-muted'}`}>{result.errors.length} errors</span>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="kpi-import-errors-table">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                    <tr><th className="px-4 py-2">Row</th><th className="px-4 py-2">Column</th><th className="px-4 py-2">Problem</th></tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">{e.row}</td>
                        <td className="px-4 py-2 text-content-muted">{e.column ?? '—'}</td>
                        <td className="px-4 py-2 text-content-strong">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
