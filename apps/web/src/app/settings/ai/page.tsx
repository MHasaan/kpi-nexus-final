'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react';

import {
  ApiError,
  api,
  getAccessToken,
  listAiConfigs,
  resetAiFeatureConfig,
  updateAiFeatureConfig,
} from '../../../lib/api-client';
import type { AiFeatureConfig, AiProviderKey } from '../../../lib/api-client';
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
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

interface Budget {
  dailySpend: number;
  monthlySpend: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  circuitBreaker: 'FAIL_CLOSED' | 'FALLBACK';
}

interface ByoProvider {
  key: string;
  displayName: string;
  configured: boolean;
}

/** Selectable model vendors for the per-feature routing dropdown. */
const PROVIDER_OPTIONS: { value: AiProviderKey; label: string }[] = [
  { value: 'GEMINI', label: 'Gemini' },
  { value: 'CLAUDE', label: 'Claude' },
  { value: 'OPENAI', label: 'OpenAI' },
  { value: 'OLLAMA', label: 'Ollama (local)' },
];

/**
 * Common model identifiers per provider, surfaced as a datalist of suggestions
 * on the model input. This is advisory only — the field stays free-text so an
 * org can route to any model the provider supports without a code change.
 */
const MODEL_SUGGESTIONS: Record<AiProviderKey, string[]> = {
  GEMINI: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-embedding-001'],
  CLAUDE: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-7'],
  OPENAI: ['gpt-4o', 'gpt-4o-mini', 'openai-text-embedding-3-small'],
  OLLAMA: ['llama3.1', 'qwen2.5', 'nomic-embed-text'],
};

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

/** Editable routing row: provider Select + free-text model Input + Save / Reset. */
function RoutingRow({
  config,
  onSave,
  onReset,
}: {
  config: AiFeatureConfig;
  onSave: (feature: string, provider: AiProviderKey, model: string) => Promise<void>;
  onReset: (feature: string) => Promise<void>;
}) {
  const [provider, setProvider] = useState<AiProviderKey>(config.provider);
  const [model, setModel] = useState(config.model);
  const [busy, setBusy] = useState(false);

  // Re-sync local state when the row's effective config changes after a reload.
  useEffect(() => {
    setProvider(config.provider);
    setModel(config.model);
  }, [config.provider, config.model]);

  const dirty = provider !== config.provider || model.trim() !== config.model;
  const canSave = dirty && model.trim().length > 0 && !busy;
  const listId = `ai-models-${config.feature}`;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave(config.feature, provider, model.trim());
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await onReset(config.feature);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TableRow data-testid={`ai-config-${config.feature}`}>
      <TableCell className="font-medium align-top">{config.feature}</TableCell>
      <TableCell>
        <Select
          aria-label={`Provider for ${config.feature}`}
          data-testid={`ai-config-${config.feature}-provider`}
          value={provider}
          disabled={busy}
          onChange={(e) => setProvider(e.target.value as AiProviderKey)}
        >
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Model for ${config.feature}`}
          data-testid={`ai-config-${config.feature}-model`}
          className="font-mono"
          list={listId}
          value={model}
          disabled={busy}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id={listId}>
          {MODEL_SUGGESTIONS[provider].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </TableCell>
      <TableCell className="align-top">
        <Badge tone={config.isOverride ? 'info' : 'neutral'}>
          {config.isOverride ? 'Override' : 'Default'}
        </Badge>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            data-testid={`ai-config-${config.feature}-save`}
            disabled={!canSave}
            onClick={save}
          >
            Save
          </Button>
          {config.isOverride && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid={`ai-config-${config.feature}-reset`}
              disabled={busy}
              onClick={reset}
            >
              Reset
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function AiSettingsPage() {
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [configs, setConfigs] = useState<AiFeatureConfig[]>([]);
  const [byo, setByo] = useState<ByoProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dailyCap, setDailyCap] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  /** Flash a transient success toast (auto-clears after 4s). */
  const flash = useCallback((msg: string) => {
    setError(null);
    setSuccess(msg);
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const load = useCallback(() => {
    api<Budget>('/ai/budget')
      .then((b) => {
        setBudget(b);
        setDailyCap(String(b.dailyCapUsd));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load budget'));
    listAiConfigs().then(setConfigs).catch(() => undefined);
    api<ByoProvider[]>('/ai/providers/byok').then(setByo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    load();
  }, [load, router]);

  const saveCap = async () => {
    setError(null);
    try {
      await api('/ai/budget', { method: 'PATCH', body: JSON.stringify({ dailyCapUsd: Number(dailyCap) }) });
      flash('Daily cap updated.');
      load();
    } catch (e) {
      setSuccess(null);
      setError(e instanceof ApiError ? e.message : 'Save failed');
    }
  };

  const saveConfig = async (feature: string, provider: AiProviderKey, model: string) => {
    setError(null);
    try {
      await updateAiFeatureConfig(feature, { providerId: provider, model });
      flash(`${feature} now routes to ${provider} / ${model}.`);
      load();
    } catch (e) {
      setSuccess(null);
      setError(e instanceof ApiError ? e.message : 'Routing update failed');
    }
  };

  const resetConfig = async (feature: string) => {
    setError(null);
    try {
      await resetAiFeatureConfig(feature);
      flash(`${feature} reverted to its default route.`);
      load();
    } catch (e) {
      setSuccess(null);
      setError(e instanceof ApiError ? e.message : 'Reset failed');
    }
  };

  const saveKey = async (key: string) => {
    setError(null);
    const apiKey = (keyInputs[key] ?? '').trim();
    if (!apiKey) return;
    try {
      await api(`/ai/providers/${key}/byok`, { method: 'POST', body: JSON.stringify({ apiKey }) });
      setKeyInputs((s) => ({ ...s, [key]: '' }));
      flash(`${key} key saved.`);
      load();
    } catch (e) {
      setSuccess(null);
      setError(e instanceof ApiError ? e.message : 'Key save failed');
    }
  };

  const clearKey = async (key: string) => {
    setError(null);
    try {
      await api(`/ai/providers/${key}/byok`, { method: 'DELETE' });
      flash(`${key} key cleared.`);
      load();
    } catch (e) {
      setSuccess(null);
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

        {success && (
          <div
            role="status"
            data-testid="ai-settings-success"
            className="flex items-center gap-2 rounded-lg border border-status-success bg-status-success-bg px-4 py-3 text-sm font-medium text-status-success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {success}
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
                  <p
                    className="mt-0.5 text-xs leading-snug text-content-muted"
                    data-testid="ai-circuit-breaker-help"
                  >
                    {budget.circuitBreaker === 'FAIL_CLOSED'
                      ? 'Blocks AI calls once the daily cap is reached.'
                      : 'Skips to a cheaper fallback model once over budget.'}
                  </p>
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
                  Daily usage resets at 00:00 UTC; the monthly cap resets on the 1st (UTC).
                </p>
                <p className="text-xs text-content-muted" data-testid="ai-circuit-breaker-legend">
                  <span className="font-medium text-content-strong">Over budget?</span>{' '}
                  <span className="font-medium">Fail closed</span> blocks further AI calls until
                  the cap resets. <span className="font-medium">Fallback</span> keeps AI working by
                  switching each feature to its cheaper fallback model.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Per-feature config */}
        <section className="space-y-3" data-testid="ai-configs-section">
          <div>
            <h2 className="text-sm font-semibold text-content-strong">Feature routing</h2>
            <p className="mt-0.5 text-xs text-content-muted">
              Choose which provider and model power each AI feature. Saving creates an org
              override; Reset reverts a feature to its built-in default.
            </p>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((c) => (
                  <RoutingRow
                    key={c.feature}
                    config={c}
                    onSave={saveConfig}
                    onReset={resetConfig}
                  />
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
