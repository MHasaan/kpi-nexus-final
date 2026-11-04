'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Button,
  Card,
  Input,
  Label,
  Select,
} from '../../../components/ui';
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
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { usePermissions } from '../../../lib/use-permissions';

type Operator = '>' | '<' | '>=' | '<=' | '==';

export default function NewAlertRulePage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const { ready: permsReady, has } = usePermissions();
  // Channels are an ORG_SETTINGS resource (FE-014): only load them for users who can.
  const canManageChannels = permsReady && has('ORG_SETTINGS');

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
      router.replace(currentLoginRedirect());
      return;
    }
    void (async () => {
      try {
        const k = await listKpis();
        setKpis(k);
        if (k.length > 0 && k[0]) setKpiId(k[0].id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace(currentLoginRedirect());
        }
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!canManageChannels) return;
    listNotificationChannels()
      .then(setChannels)
      .catch(() => setChannels([]));
  }, [canManageChannels]);

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
      // Land on the rules list so the new rule is visible (FE-006).
      router.push('/alerts/rules');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create alert rule');
      setSubmitting(false);
    }
  }

  return (
    <RequirePermission permission="ALERTS_VIEW">
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-content-strong" data-testid="new-rule-heading">
          New alert rule
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Define a condition on a KPI and an optional escalation policy.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5" data-testid="new-rule-form">
          <Card className="grid gap-5 p-5">
            <div className="grid gap-2">
              <Label htmlFor="rule-name" required>
                Name
              </Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                data-testid="rule-name-input"
                placeholder="e.g. MRR below floor"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-kpi" required>
                KPI
              </Label>
              <Select
                id="rule-kpi"
                value={kpiId}
                onChange={(e) => setKpiId(e.target.value)}
                data-testid="rule-kpi-select"
              >
                {kpis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rule-type">Rule type</Label>
                <Select
                  id="rule-type"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as AlertRuleType)}
                  data-testid="rule-type-select"
                >
                  <option value="STATIC_THRESHOLD">Static threshold</option>
                  <option value="DYNAMIC_STDDEV">Dynamic (std-dev)</option>
                  <option value="RATE_OF_CHANGE">Rate of change</option>
                  <option value="NO_DATA">No data</option>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-severity">Severity</Label>
                <Select
                  id="rule-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
                  data-testid="rule-severity-select"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </Select>
              </div>
            </div>
          </Card>

          {/* Type-specific config */}
          <Card className="p-5">
            <fieldset data-testid="rule-config">
              <legend className="kn-eyebrow mb-3">Condition</legend>
              {ruleType === 'STATIC_THRESHOLD' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-operator">Operator</Label>
                    <Select
                      id="rule-operator"
                      value={operator}
                      onChange={(e) => setOperator(e.target.value as Operator)}
                      data-testid="rule-operator-select"
                      className="w-24"
                    >
                      {(['>', '<', '>=', '<=', '=='] as Operator[]).map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-threshold">Value</Label>
                    <Input
                      id="rule-threshold"
                      type="number"
                      step="any"
                      value={thresholdValue}
                      onChange={(e) => setThresholdValue(e.target.value)}
                      data-testid="rule-threshold-input"
                      className="w-40"
                    />
                  </div>
                </div>
              )}
              {ruleType === 'DYNAMIC_STDDEV' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-sigmas">σ count</Label>
                    <Input id="rule-sigmas" type="number" step="any" value={sigmas} onChange={(e) => setSigmas(e.target.value)} className="w-28" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-window">Window</Label>
                    <Input id="rule-window" type="number" value={windowSize} onChange={(e) => setWindowSize(e.target.value)} className="w-28" />
                  </div>
                </div>
              )}
              {ruleType === 'RATE_OF_CHANGE' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-pct">% change</Label>
                    <Input id="rule-pct" type="number" step="any" value={pctChange} onChange={(e) => setPctChange(e.target.value)} className="w-28" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-winmin">Window (min)</Label>
                    <Input id="rule-winmin" type="number" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} className="w-28" />
                  </div>
                </div>
              )}
              {ruleType === 'NO_DATA' && (
                <div className="grid gap-2">
                  <Label htmlFor="rule-stale">Max stale (min)</Label>
                  <Input id="rule-stale" type="number" value={maxStaleMinutes} onChange={(e) => setMaxStaleMinutes(e.target.value)} className="w-40" />
                </div>
              )}
            </fieldset>
          </Card>

          {/* Escalation builder */}
          <Card className="p-5">
            <fieldset data-testid="escalation-builder">
              <legend className="kn-eyebrow mb-3">Escalation (optional)</legend>
              <div className="grid gap-3">
                {levels.map((lvl, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-surface-1 p-4"
                    data-testid={`escalation-level-${idx}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-content-strong">Level {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setLevels((p) => p.filter((_, i) => i !== idx))}
                        data-testid={`escalation-remove-${idx}`}
                        className="text-status-critical hover:bg-status-critical-bg"
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Label htmlFor={`escalation-delay-${idx}`}>Delay (min)</Label>
                      <Input
                        id={`escalation-delay-${idx}`}
                        type="number"
                        min={0}
                        value={lvl.delayMinutes}
                        onChange={(e) => updateLevel(idx, { delayMinutes: Number(e.target.value) })}
                        data-testid={`escalation-delay-${idx}`}
                        className="w-28"
                      />
                    </div>
                    <div className="mt-3">
                      <span className="kn-eyebrow">Channels</span>
                      {channels.length === 0 && (
                        <p className="mt-1 text-xs text-content-muted">
                          {canManageChannels
                            ? 'No channels yet — create one under Channels.'
                            : 'Notification channels are managed by an administrator.'}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3">
                        {channels.map((ch) => (
                          <label key={ch.id} className="flex items-center gap-1.5 text-xs text-content">
                            <input
                              type="checkbox"
                              checked={lvl.channelIds.includes(ch.id)}
                              onChange={() => toggleChannel(idx, ch.id)}
                              data-testid={`escalation-${idx}-channel-${ch.id}`}
                              className="accent-[hsl(var(--accent-primary))]"
                            />
                            {ch.name} ({ch.kind})
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addLevel}
                    data-testid="escalation-add-level"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add escalation level
                  </Button>
                </div>
              </div>
            </fieldset>
          </Card>

          {error && (
            <p role="alert" data-testid="rule-error" className="text-sm text-status-critical">
              {error}
            </p>
          )}

          <div>
            <Button type="submit" isLoading={submitting} data-testid="rule-submit">
              {submitting ? 'Creating…' : 'Create alert rule'}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
    </RequirePermission>
  );
}
