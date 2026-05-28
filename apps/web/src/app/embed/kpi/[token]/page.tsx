'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  getPublicEmbedKpi,
  type EmbedKpiSnapshot,
} from '../../../../lib/api-client';

// Recharts is client-only — use dynamic import to avoid SSR issues
const SparklineChart = dynamic(() => import('./sparkline-chart'), { ssr: false });

function statusBg(status: string | null): string {
  if (!status) return 'bg-surface-bg';
  const s = status.toUpperCase();
  if (s === 'CRITICAL' || s === 'RED') return 'bg-status-critical/5';
  if (s === 'WARNING' || s === 'AMBER') return 'bg-status-warning/5';
  if (s === 'OK' || s === 'GREEN') return 'bg-status-success/5';
  return 'bg-surface-bg';
}

function statusTextColor(status: string | null): string {
  if (!status) return 'text-content-strong';
  const s = status.toUpperCase();
  if (s === 'CRITICAL' || s === 'RED') return 'text-status-critical';
  if (s === 'WARNING' || s === 'AMBER') return 'text-status-warning';
  if (s === 'OK' || s === 'GREEN') return 'text-status-success';
  return 'text-content-strong';
}

export default function EmbedKpiPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [snapshot, setSnapshot] = useState<EmbedKpiSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicEmbedKpi(token);
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load KPI');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center bg-surface-bg p-3">
        <p className="text-xs text-content-muted">Loading…</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div
        className="flex h-full min-h-[180px] items-center justify-center bg-surface-bg p-3"
        data-testid="embed-kpi-error"
      >
        <p className="text-xs text-status-critical">{error ?? 'Not found'}</p>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full min-h-[180px] flex-col justify-between p-3 ${statusBg(snapshot.thresholdStatus)}`}
      data-testid="embed-kpi-card"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
          {snapshot.kpiName}
        </p>
        {snapshot.latestValue !== null ? (
          <p className={`mt-1 text-2xl font-bold ${statusTextColor(snapshot.thresholdStatus)}`}>
            {snapshot.latestValue.toLocaleString()}
            {snapshot.unit && (
              <span className="ml-1 text-xs font-normal text-content-muted">{snapshot.unit}</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-content-muted">No data</p>
        )}
        {snapshot.latestRecordedAt && (
          <p className="mt-0.5 text-xs text-content-muted">
            {new Date(snapshot.latestRecordedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {snapshot.sparkline.length > 1 && (
        <div className="mt-2 h-12">
          <SparklineChart data={snapshot.sparkline} />
        </div>
      )}
    </div>
  );
}
