'use client';

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
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '../../../components/ui';

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
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Import KPIs"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Import' },
      ]}
    >
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col gap-1">
          <h1
            className="text-2xl font-bold tracking-tight text-content-strong"
            data-testid="kpi-import-heading"
          >
            Bulk import KPIs
          </h1>
          <p className="text-sm text-content-muted">
            Paste CSV with a header row. Columns are matched case-insensitively (e.g.{' '}
            <code className="rounded bg-surface-2 px-1 font-mono">KPI Name</code>,{' '}
            <code className="rounded bg-surface-2 px-1 font-mono">Target</code>,{' '}
            <code className="rounded bg-surface-2 px-1 font-mono">Type</code>). Run a dry-run to
            validate, then commit. Creates ORG_WIDE KPIs.
          </p>
        </div>

        <Card className="p-5">
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            data-testid="kpi-import-textarea"
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCsv(SAMPLE)} data-testid="kpi-import-sample">
              Load sample
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDryRun()}
              disabled={running || csv.trim() === ''}
              isLoading={running}
              data-testid="kpi-import-dryrun"
            >
              Dry-run
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCommit()}
              disabled={!canCommit || committing}
              isLoading={committing}
              data-testid="kpi-import-commit"
            >
              Commit import
            </Button>
          </div>
        </Card>

        {error && (
          <div
            role="alert"
            data-testid="kpi-import-error"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}
        {done && (
          <div
            role="status"
            data-testid="kpi-import-done"
            className="rounded-lg border border-border bg-status-success-bg px-4 py-3 text-sm text-status-success"
          >
            {done}
          </div>
        )}

        {result && (
          <section className="space-y-3" data-testid="kpi-import-result">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success" data-testid="kpi-import-valid-count">
                {result.valid.length} valid
              </Badge>
              <Badge
                tone={result.errors.length > 0 ? 'error' : 'neutral'}
                data-testid="kpi-import-error-count"
              >
                {result.errors.length} errors
              </Badge>
            </div>
            {result.errors.length > 0 && (
              <Card className="overflow-hidden p-0" data-testid="kpi-import-errors-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Row</TableHead>
                      <TableHead>Column</TableHead>
                      <TableHead>Problem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-right tabular-nums">{e.row}</TableCell>
                        <TableCell className="text-content-muted">{e.column ?? '—'}</TableCell>
                        <TableCell className="text-content-strong">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </section>
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}
