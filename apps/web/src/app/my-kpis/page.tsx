'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Target } from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  ScopeBadge,
  Skeleton,
  StatusBadge,
  type KpiStatus,
} from '../../components/ui';
import {
  ApiError,
  getAccessToken,
  listMyKpis,
  recordMyKpiData,
  type MyKpiRow,
} from '../../lib/api-client';
import { currentLoginRedirect } from '../../lib/auth-redirect';

function toStatus(raw: string | null | undefined): KpiStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'exceeded':
    case 'on_track':
    case 'on-track':
      return 'on-track';
    case 'at_risk':
    case 'at-risk':
      return 'at-risk';
    case 'behind':
    case 'off_track':
    case 'off-track':
      return 'off-track';
    default:
      return 'no-data';
  }
}

export default function MyKpisPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MyKpiRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyKpis()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    load();
  }, [load, router]);

  return (
    <AppShell title="My KPIs" crumbs={['You', 'My KPIs']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="My KPIs"
          subtitle="Your personal assignments. Record values inline — they post to the scope-correct endpoint."
        />

        <div className="flex items-center gap-2 rounded-lg border border-status-info/30 bg-status-info-bg px-4 py-2.5 text-sm text-status-info">
          <Info aria-hidden className="h-4 w-4 shrink-0" />
          <span>
            Entries post to{' '}
            <span className="font-mono text-xs">/user-kpis/my-kpis/:id/data</span> · optimistic.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="my-kpis-error"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {rows === null && !error ? (
          <div className="flex flex-col gap-3" data-testid="my-kpis-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="m-4 h-20" />
              </Card>
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={Target}
              title="No KPIs assigned to you yet"
              description="When a manager assigns you a personal KPI, you'll record its values here."
            />
            <span data-testid="my-kpis-list" className="sr-only" />
          </Card>
        ) : rows ? (
          <div className="flex flex-col gap-3" data-testid="my-kpis-list">
            {rows.map((r) => (
              <MyKpiCard key={r.assignmentId} row={r} onRecorded={load} />
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function MyKpiCard({ row, onRecorded }: { row: MyKpiRow; onRecorded: () => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await recordMyKpiData(row.assignmentId, Number(value), now, now);
      setValue('');
      onRecorded();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <ScopeBadge scope="PER_USER" />
          <Link
            href={`/kpis/${row.kpiId}`}
            className="font-semibold text-content-strong hover:text-accent-primary"
          >
            {row.name}
          </Link>
        </span>
        <StatusBadge status={toStatus(row.status)} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="tabular-nums">
          <span className="text-content-muted">Current </span>
          <span className="font-semibold text-content-strong">
            {row.currentValue ?? '—'}
            {row.unit ? ` ${row.unit}` : ''}
          </span>
        </span>
        {row.targetValue !== null && (
          <span className="tabular-nums text-content-muted">Target {row.targetValue}</span>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          step="any"
          required
          placeholder={row.unit ? `new value (${row.unit})…` : 'new value'}
          className="flex-1 tabular-nums"
          data-testid={`mykpi-value-${row.kpiId}`}
        />
        <Button type="submit" isLoading={saving} data-testid={`mykpi-record-${row.kpiId}`}>
          Record
        </Button>
      </form>
      {err && <p className="text-xs text-status-critical">{err}</p>}
    </Card>
  );
}
