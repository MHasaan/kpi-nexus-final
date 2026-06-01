'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, OctagonAlert } from 'lucide-react';

import { ApiError, api, getAccessToken } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Metric,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui';

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

/** Spend tile: eyebrow label + large tabular value + sub-line cap. */
function SpendTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <Metric label={label} value={value} size="sm" />
        {sub && <p className="mt-1 text-xs tabular-nums text-content-muted">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Budget usage meter: a clamped 0–100% progress bar tinted by accent / warning /
 * critical thresholds, with an always-visible numeric "$spend / $cap" label
 * (never colour-only) and an icon+label status when at/over the warning line.
 */
function BudgetMeter({
  label,
  spend,
  cap,
  testId,
}: {
  label: string;
  spend: number;
  cap: number;
  testId: string;
}) {
  const hasCap = cap > 0;
  const rawPct = hasCap ? (spend / cap) * 100 : 0;
  const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
  const over = hasCap && rawPct >= 100;
  const warn = hasCap && rawPct >= 80 && rawPct < 100;
  const barTone = over ? 'bg-status-critical' : warn ? 'bg-status-warning' : 'bg-accent-primary';

  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-content-strong">{label}</span>
        <span className="tabular-nums text-content-muted" data-testid={`${testId}-label`}>
          ${spend.toFixed(2)} / ${cap.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-surface-2">
        <div
          className={`h-full transition-[width] duration-200 ${barTone}`}
          style={{ width: `${pct}%` }}
          data-testid={`${testId}-bar`}
        />
      </div>
      {(warn || over) && (
        <div
          className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${
            over ? 'text-status-critical' : 'text-status-warning'
          }`}
          data-testid={`${testId}-status`}
        >
          {over ? (
            <OctagonAlert className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="tabular-nums">
            {over ? `Cap reached (${pct}%)` : `Near cap (${pct}%)`}
          </span>
        </div>
      )}
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
    <RequirePermission permission="ORG_SETTINGS">
      <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="AI Settings"
          subtitle="Control AI spend, per-feature model routing, and your own provider keys."
        />

        {error && (
          <div
            role="alert"
            data-testid="ai-settings-error"
            className="rounded-lg border border-status-critical bg-status-critical-bg px-4 py-3 text-sm font-medium text-status-critical"
          >
            {error}
          </div>
        )}

        {/* Budget */}
        <section className="space-y-3" data-testid="ai-budget-section">
          <h2 className="text-sm font-semibold text-content-strong">Spend budget</h2>
          {budget && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SpendTile
                label="Today"
                value={`$${budget.dailySpend.toFixed(2)}`}
                sub={`cap $${budget.dailyCapUsd}`}
              />
              <SpendTile
                label="This month"
                value={`$${budget.monthlySpend.toFixed(2)}`}
                sub={`cap $${budget.monthlyCapUsd}`}
              />
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <span className="kn-eyebrow">Circuit breaker</span>
                  <Badge tone={budget.circuitBreaker === 'FAIL_CLOSED' ? 'warning' : 'info'}>
                    {budget.circuitBreaker === 'FAIL_CLOSED' ? 'Fail closed' : 'Fallback'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2">
                  <Label htmlFor="daily-cap">Daily cap (USD)</Label>
                  <Input
                    id="daily-cap"
                    data-testid="ai-daily-cap-input"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    data-testid="ai-save-cap"
                    onClick={saveCap}
                  >
                    Save
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {budget && (
            <Card data-testid="ai-budget-meters">
              <CardContent className="space-y-4">
                <BudgetMeter
                  label="Daily spend"
                  spend={budget.dailySpend}
                  cap={budget.dailyCapUsd}
                  testId="ai-budget-meter-daily"
                />
                <BudgetMeter
                  label="Monthly spend"
                  spend={budget.monthlySpend}
                  cap={budget.monthlyCapUsd}
                  testId="ai-budget-meter-monthly"
                />
                <p className="text-xs text-content-muted" data-testid="ai-budget-resets">
                  Daily usage resets 00:00 UTC.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Per-feature config */}
        <section className="space-y-3" data-testid="ai-configs-section">
          <h2 className="text-sm font-semibold text-content-strong">Feature routing</h2>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((c) => (
                  <TableRow key={c.feature} data-testid={`ai-config-${c.feature}`}>
                    <TableCell className="font-medium">{c.feature}</TableCell>
                    <TableCell className="text-content-muted">{c.provider}</TableCell>
                    <TableCell className="font-mono text-content-muted">{c.model}</TableCell>
                    <TableCell>
                      <Badge tone={c.isOverride ? 'info' : 'neutral'}>
                        {c.isOverride ? 'Override' : 'Default'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* BYO keys */}
        <section className="space-y-3" data-testid="ai-byo-section">
          <Card>
            <CardHeader>
              <CardTitle>Bring your own keys</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byo.map((p) => (
                <div
                  key={p.key}
                  data-testid={`ai-byo-${p.key}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3"
                >
                  <span className="w-40 text-sm font-medium text-content-strong">{p.displayName}</span>
                  {p.configured ? (
                    <>
                      <Badge tone="success" data-testid={`ai-byo-${p.key}-configured`}>
                        Configured
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="ml-auto"
                        data-testid={`ai-byo-${p.key}-clear`}
                        onClick={() => clearKey(p.key)}
                      >
                        Clear
                      </Button>
                    </>
                  ) : (
                    <>
                      <Input
                        data-testid={`ai-byo-${p.key}-input`}
                        value={keyInputs[p.key] ?? ''}
                        onChange={(e) => setKeyInputs((s) => ({ ...s, [p.key]: e.target.value }))}
                        placeholder={p.key === 'OLLAMA' ? 'local — no key' : 'Paste API key'}
                        disabled={p.key === 'OLLAMA'}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`ai-byo-${p.key}-save`}
                        onClick={() => saveKey(p.key)}
                        disabled={p.key === 'OLLAMA'}
                      >
                        Save
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
      </AppShell>
    </RequirePermission>
  );
}
