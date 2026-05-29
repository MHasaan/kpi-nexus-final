'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createAlertRule,
  getAccessToken,
  listKpis,
  listNotificationChannels,
  type AlertRuleType,
  type AlertSeverity,
  type EscalationLevelInput,
  type KpiSummary,
  type NotificationChannel,
} from '../../../lib/api-client';

type Operator = '>' | '<' | '>=' | '<=' | '==';

export default function NewAlertRulePage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);

  const [name, setName] = useState('');
  const [kpiId, setKpiId] = useState('');
  const [ruleType, setRuleType] = useState<AlertRuleType>('STATIC_THRESHOLD');
  const [severity, setSeverity] = useState<AlertSeverity>('MEDIUM');

  // type-specific config
  const [operator, setOperator] = useState<Operator>('>');
  const [thresholdValue, setThresholdValue] = useState('');
  const [sigmas, setSigmas] = useState('3');
  const [windowSize, setWindowSize] = useState('20');
  const [pctChange, setPctChange] = useState('10');
  const [windowMinutes, setWindowMinutes] = useState('60');
  const [maxStaleMinutes, setMaxStaleMinutes] = useState('1440');

  // escalation levels
  const [levels, setLevels] = useState<EscalationLevelInput[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const [k, c] = await Promise.all([listKpis(), listNotificationChannels()]);
        setKpis(k);
        setChannels(c);
        if (k.length > 0 && k[0]) setKpiId(k[0].id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
        }
      }
    })();
  }, [router]);

  function buildConfig(): Record<string, unknown> {
    switch (ruleType) {
      case 'STATIC_THRESHOLD':
        return { operator, value: Number(thresholdValue) };
      case 'DYNAMIC_STDDEV':
        return { sigmas: Number(sigmas), windowSize: Number(windowSize) };
      case 'RATE_OF_CHANGE':
        return { pctChange: Number(pctChange), windowMinutes: Number(windowMinutes) };
      case 'NO_DATA':
        return { maxStaleMinutes: Number(maxStaleMinutes) };
      default:
        return {};
    }
  }

  function addLevel() {
    setLevels((prev) => [
      ...prev,
      { delayMinutes: prev.length === 0 ? 0 : 5, channelIds: [], notifyRoleIds: [], notifyUserIds: [] },
    ]);
  }

  function updateLevel(idx: number, patch: Partial<EscalationLevelInput>) {
    setLevels((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function toggleChannel(idx: number, channelId: string) {
    setLevels((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const has = l.channelIds.includes(channelId);
        return {
          ...l,
          channelIds: has ? l.channelIds.filter((c) => c !== channelId) : [...l.channelIds, channelId],
        };
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!kpiId) {
      setError('Select a KPI.');
      return;
    }
    if (ruleType === 'STATIC_THRESHOLD' && thresholdValue.trim() === '') {
      setError('Enter a threshold value.');
      return;
    }
    setSubmitting(true);
    try {
      await createAlertRule({
        kpiId,
        name: name.trim(),
        ruleType,
        severity,
        config: buildConfig(),
        escalationLevels: levels.length > 0 ? levels : undefined,
      });
      router.push('/alerts');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create alert rule');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/alerts" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            ← Alerts
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-content-strong" data-testid="new-rule-heading">
          New alert rule
        </h1>

        <form onSubmit={handleSubmit} className="grid gap-5" data-testid="new-rule-form">
          <label className="block">
            <span className="text-sm font-medium text-content-default">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              data-testid="rule-name-input"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-content-default">KPI</span>
            <select
              value={kpiId}
              onChange={(e) => setKpiId(e.target.value)}
              data-testid="rule-kpi-select"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
            >
              {kpis.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-content-default">Rule type</span>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as AlertRuleType)}
                data-testid="rule-type-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
              >
                <option value="STATIC_THRESHOLD">Static threshold</option>
                <option value="DYNAMIC_STDDEV">Dynamic (std-dev)</option>
                <option value="RATE_OF_CHANGE">Rate of change</option>
                <option value="NO_DATA">No data</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
                data-testid="rule-severity-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
          </div>

          {/* Type-specific config */}
          <fieldset className="rounded-md border border-border p-4" data-testid="rule-config">
            <legend className="px-1 text-xs font-semibold uppercase text-content-muted">Condition</legend>
            {ruleType === 'STATIC_THRESHOLD' && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="text-sm text-content-default">Operator</span>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as Operator)}
                    data-testid="rule-operator-select"
                    className="mt-1 rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong"
                  >
                    {(['>', '<', '>=', '<=', '=='] as Operator[]).map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-content-default">Value</span>
                  <input
                    type="number"
                    step="any"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    data-testid="rule-threshold-input"
                    className="mt-1 w-40 rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong"
                  />
                </label>
              </div>
            )}
            {ruleType === 'DYNAMIC_STDDEV' && (
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label>σ count<input type="number" step="any" value={sigmas} onChange={(e) => setSigmas(e.target.value)} className="ml-2 w-24 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
                <label>Window<input type="number" value={windowSize} onChange={(e) => setWindowSize(e.target.value)} className="ml-2 w-24 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
              </div>
            )}
            {ruleType === 'RATE_OF_CHANGE' && (
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label>% change<input type="number" step="any" value={pctChange} onChange={(e) => setPctChange(e.target.value)} className="ml-2 w-24 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
                <label>Window (min)<input type="number" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} className="ml-2 w-24 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
              </div>
            )}
            {ruleType === 'NO_DATA' && (
              <label className="text-sm">Max stale (min)<input type="number" value={maxStaleMinutes} onChange={(e) => setMaxStaleMinutes(e.target.value)} className="ml-2 w-28 rounded-md border border-border bg-surface-bg px-2 py-1" /></label>
            )}
          </fieldset>

          {/* Escalation builder */}
          <fieldset className="rounded-md border border-border p-4" data-testid="escalation-builder">
            <legend className="px-1 text-xs font-semibold uppercase text-content-muted">Escalation (optional)</legend>
            {levels.map((lvl, idx) => (
              <div key={idx} className="mb-3 rounded-md border border-border bg-surface-2 p-3" data-testid={`escalation-level-${idx}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-content-strong">Level {idx + 1}</span>
                  <button type="button" onClick={() => setLevels((p) => p.filter((_, i) => i !== idx))} className="text-xs text-status-critical hover:underline" data-testid={`escalation-remove-${idx}`}>Remove</button>
                </div>
                <label className="mt-2 block text-sm">Delay (min)
                  <input type="number" min={0} value={lvl.delayMinutes} onChange={(e) => updateLevel(idx, { delayMinutes: Number(e.target.value) })} data-testid={`escalation-delay-${idx}`} className="ml-2 w-24 rounded-md border border-border bg-surface-bg px-2 py-1" />
                </label>
                <div className="mt-2">
                  <span className="text-xs text-content-muted">Channels</span>
                  {channels.length === 0 && <p className="text-xs text-content-muted">No channels yet — create one under Channels.</p>}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {channels.map((ch) => (
                      <label key={ch.id} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={lvl.channelIds.includes(ch.id)} onChange={() => toggleChannel(idx, ch.id)} data-testid={`escalation-${idx}-channel-${ch.id}`} />
                        {ch.name} ({ch.kind})
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLevel} data-testid="escalation-add-level" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs text-content-default hover:bg-surface-2">
              + Add escalation level
            </button>
          </fieldset>

          {error && (
            <p role="alert" data-testid="rule-error" className="text-sm text-status-critical">{error}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={submitting}
              data-testid="rule-submit"
              className="rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create alert rule'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
