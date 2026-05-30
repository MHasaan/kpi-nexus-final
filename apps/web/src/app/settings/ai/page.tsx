'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, api, getAccessToken } from '../../../lib/api-client';

interface Budget {
  dailySpend: number;
  monthlySpend: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  circuitBreaker: 'FAIL_CLOSED' | 'FALLBACK';
}

interface FeatureConfig {
  feature: string;
  provider: string;
  model: string;
  isOverride: boolean;
}

interface ByoProvider {
  key: string;
  displayName: string;
  configured: boolean;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <p className="text-xs text-content-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-content-strong">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-content-muted">{sub}</p>}
    </div>
  );
}

export default function AiSettingsPage() {
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [configs, setConfigs] = useState<FeatureConfig[]>([]);
  const [byo, setByo] = useState<ByoProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dailyCap, setDailyCap] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<Budget>('/ai/budget')
      .then((b) => {
        setBudget(b);
        setDailyCap(String(b.dailyCapUsd));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load budget'));
    api<FeatureConfig[]>('/ai/configs').then(setConfigs).catch(() => undefined);
    api<ByoProvider[]>('/ai/providers/byok').then(setByo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const saveCap = async () => {
    setError(null);
    try {
      await api('/ai/budget', { method: 'PATCH', body: JSON.stringify({ dailyCapUsd: Number(dailyCap) }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    }
  };

  const saveKey = async (key: string) => {
    setError(null);
    const apiKey = (keyInputs[key] ?? '').trim();
    if (!apiKey) return;
    try {
      await api(`/ai/providers/${key}/byok`, { method: 'POST', body: JSON.stringify({ apiKey }) });
      setKeyInputs((s) => ({ ...s, [key]: '' }));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Key save failed');
    }
  };

  const clearKey = async (key: string) => {
    try {
      await api(`/ai/providers/${key}/byok`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Clear failed');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">AI Settings</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">AI Settings</h1>
        {error && <p className="text-sm text-status-critical" data-testid="ai-settings-error">{error}</p>}

        {/* Budget */}
        <section data-testid="ai-budget-section">
          <h2 className="text-sm font-semibold text-content-strong">Spend budget</h2>
          {budget && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Today" value={`$${budget.dailySpend.toFixed(2)}`} sub={`cap $${budget.dailyCapUsd}`} />
              <Tile label="This month" value={`$${budget.monthlySpend.toFixed(2)}`} sub={`cap $${budget.monthlyCapUsd}`} />
              <Tile label="Circuit breaker" value={budget.circuitBreaker} />
              <div className="rounded-lg border border-border bg-surface-1 p-4">
                <label className="text-xs text-content-muted" htmlFor="daily-cap">Daily cap (USD)</label>
                <input
                  id="daily-cap"
                  data-testid="ai-daily-cap-input"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
                />
                <button
                  type="button"
                  data-testid="ai-save-cap"
                  onClick={saveCap}
                  className="mt-2 w-full rounded bg-accent-primary px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Per-feature config */}
        <section data-testid="ai-configs-section">
          <h2 className="text-sm font-semibold text-content-strong">Feature routing</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-content-muted">
                <tr>
                  <th className="px-4 py-2">Feature</th>
                  <th className="px-4 py-2">Provider</th>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.feature} className="border-t border-border bg-surface-1" data-testid={`ai-config-${c.feature}`}>
                    <td className="px-4 py-2 text-content-strong">{c.feature}</td>
                    <td className="px-4 py-2 text-content-muted">{c.provider}</td>
                    <td className="px-4 py-2 text-content-muted">{c.model}</td>
                    <td className="px-4 py-2 text-xs text-content-muted">{c.isOverride ? 'override' : 'default'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* BYO keys */}
        <section data-testid="ai-byo-section">
          <h2 className="text-sm font-semibold text-content-strong">Bring your own keys</h2>
          <div className="mt-3 space-y-2">
            {byo.map((p) => (
              <div
                key={p.key}
                data-testid={`ai-byo-${p.key}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3"
              >
                <span className="w-40 text-sm text-content-strong">{p.displayName}</span>
                {p.configured ? (
                  <>
                    <span className="text-xs text-status-positive" data-testid={`ai-byo-${p.key}-configured`}>Configured</span>
                    <button
                      type="button"
                      data-testid={`ai-byo-${p.key}-clear`}
                      onClick={() => clearKey(p.key)}
                      className="ml-auto rounded border border-border px-3 py-1 text-xs text-content-muted hover:bg-surface-2"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      data-testid={`ai-byo-${p.key}-input`}
                      value={keyInputs[p.key] ?? ''}
                      onChange={(e) => setKeyInputs((s) => ({ ...s, [p.key]: e.target.value }))}
                      placeholder={p.key === 'OLLAMA' ? 'local — no key' : 'Paste API key'}
                      disabled={p.key === 'OLLAMA'}
                      className="flex-1 rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
                    />
                    <button
                      type="button"
                      data-testid={`ai-byo-${p.key}-save`}
                      onClick={() => saveKey(p.key)}
                      disabled={p.key === 'OLLAMA'}
                      className="rounded bg-accent-primary px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
