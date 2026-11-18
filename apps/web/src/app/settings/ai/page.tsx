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
import { aiFeatureInfo, isAiFeatureInUse } from '../../../lib/ai-features';
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
import { useAllowed } from '../../../lib/use-allowed';

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
  // Free-tier usable (checked 2026-10-09). Pro models have 0 free quota and
  // gemini-2.5-flash is closed to new keys, so they are not suggested.
  GEMINI: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-embedding-001'],
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
  onSave: (config: AiFeatureConfig, provider: AiProviderKey, model: string, capUsd: number | undefined, fallback: { provider: AiProviderKey; model: string } | undefined) => Promise<void>;
  onReset: (feature: string) => Promise<void>;
}) {
  const [provider, setProvider] = useState<AiProviderKey>(config.provider);
  const [model, setModel] = useState(config.model);
  // The feature's own daily cap, as typed. Blank: no cap of its own.
  const savedCap = config.perFeatureCapUsd ? String(config.perFeatureCapUsd) : '';
  const [cap, setCap] = useState(savedCap);
  // The model used when the first one fails, or is over budget. '' = the built-in fallback for this feature.
  const savedFallbackProvider: AiProviderKey | '' = config.isOverride ? (config.fallback?.provider ?? '') : '';
  const savedFallbackModel = config.isOverride ? (config.fallback?.model ?? '') : '';
  const [fallbackProvider, setFallbackProvider] = useState<AiProviderKey | ''>(savedFallbackProvider);
  const [fallbackModel, setFallbackModel] = useState(savedFallbackModel);
  const [busy, setBusy] = useState(false);

  // Re-sync local state when the row's effective config changes after a reload.
  useEffect(() => {
    setProvider(config.provider);
    setModel(config.model);
    setCap(savedCap);
    setFallbackProvider(savedFallbackProvider);
    setFallbackModel(savedFallbackModel);
  }, [config.provider, config.model, savedCap, savedFallbackProvider, savedFallbackModel]);

  const capValue = cap.trim() === '' ? undefined : Number(cap);
  const capInvalid = capValue !== undefined && (!Number.isFinite(capValue) || capValue < 0);
  const fallbackIncomplete = fallbackProvider !== '' && fallbackModel.trim().length === 0;
  const dirty =
    provider !== config.provider ||
    model.trim() !== config.model ||
    cap.trim() !== savedCap ||
    fallbackProvider !== savedFallbackProvider ||
    (fallbackProvider !== '' && fallbackModel.trim() !== savedFallbackModel);
  const canSave = dirty && model.trim().length > 0 && !capInvalid && !fallbackIncomplete && !busy;
  const listId = `ai-models-${config.feature}`;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave(config, provider, model.trim(), capValue || undefined, fallbackProvider === '' ? undefined : { provider: fallbackProvider, model: fallbackModel.trim() });
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

  const info = aiFeatureInfo(config.feature);

  return (
    <TableRow data-testid={`ai-config-${config.feature}`}>
      <TableCell className="align-top">
        <span className="block font-medium" data-testid={`ai-config-${config.feature}-name`}>{info.name}</span>
        {info.does && <span className="block text-xs text-content-muted">{info.does}</span>}
      </TableCell>
      <TableCell>
        <Select
          aria-label={`Provider for ${info.name}`}
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
          aria-label={`Model for ${info.name}`}
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
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <Select
            aria-label={`Fallback provider for ${info.name}`}
            data-testid={`ai-config-${config.feature}-fallback-provider`}
            value={fallbackProvider}
            disabled={busy}
            onChange={(e) => setFallbackProvider(e.target.value as AiProviderKey | '')}
          >
            <option value="">Built-in fallback</option>
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          {fallbackProvider !== '' && (
            <>
              <Input
                aria-label={`Fallback model for ${info.name}`}
                aria-invalid={fallbackIncomplete || undefined}
                data-testid={`ai-config-${config.feature}-fallback-model`}
                className="font-mono"
                placeholder="Model"
                list={`${listId}-fallback`}
                value={fallbackModel}
                disabled={busy}
                onChange={(e) => setFallbackModel(e.target.value)}
              />
              <datalist id={`${listId}-fallback`}>
                {MODEL_SUGGESTIONS[fallbackProvider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Daily cap in dollars for ${info.name}`}
          aria-invalid={capInvalid || undefined}
          data-testid={`ai-config-${config.feature}-cap`}
          inputMode="decimal"
          placeholder="No cap"
          className="w-24"
          value={cap}
          disabled={busy}
          onChange={(e) => setCap(e.target.value)}
        />
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
  const [monthlyCap, setMonthlyCap] = useState('');
  const [atCap, setAtCap] = useState<'FAIL_CLOSED' | 'FALLBACK'>('FAIL_CLOSED');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);
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
        setMonthlyCap(String(b.monthlyCapUsd));
        setAtCap(b.circuitBreaker === 'FALLBACK' ? 'FALLBACK' : 'FAIL_CLOSED');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load budget'));
    // A section that failed to load says so; it used to look like "nothing configured" (X-02).
    listAiConfigs()
      .then(setConfigs)
      .catch((e) => setError(e instanceof ApiError ? `The feature models could not be loaded: ${e.message}` : 'The feature models could not be loaded.'));
    api<ByoProvider[]>('/ai/providers/byok')
      .then(setByo)
      .catch((e) => setError(e instanceof ApiError ? `Your provider keys could not be loaded: ${e.message}` : 'Your provider keys could not be loaded.'));
  }, []);

  // Nothing is asked for until the person is known to be allowed this page.
  const allowed = useAllowed('ORG_SETTINGS');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    load();
  }, [load, router, allowed]);

  /** A cap as typed: a number of dollars, 0 or more. Blank is refused — it used to be sent as 0, which means "no cap". */
  const capProblem = (label: string, typed: string): string | null => {
    const value = Number(typed);
    if (typed.trim() === '' || !Number.isFinite(value)) return `${label} must be a number of dollars. Enter 0 for no cap.`;
    if (value < 0) return `${label} cannot be below 0.`;
    return null;
  };

  const saveCap = async () => {
    setError(null);
    const problem = capProblem('Daily cap', dailyCap) ?? capProblem('Monthly cap', monthlyCap);
    setBudgetError(problem);
    if (problem) return;
    setSavingBudget(true);
    try {
      await api('/ai/budget', {
        method: 'PATCH',
        body: JSON.stringify({ dailyCapUsd: Number(dailyCap), monthlyCapUsd: Number(monthlyCap), circuitBreaker: atCap }),
      });
      flash('Budget saved.');
      load();
    } catch (e) {
      setSuccess(null);
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSavingBudget(false);
    }
  };

  const saveConfig = async (config: AiFeatureConfig, provider: AiProviderKey, model: string, capUsd: number | undefined, fallback: { provider: AiProviderKey; model: string } | undefined) => {
    setError(null);
    try {
      // The save replaces the whole row: the fallback chosen on it goes with it (none = the built-in one).
      await updateAiFeatureConfig(config.feature, {
        providerId: provider,
        model,
        ...(fallback && { fallbackProviderId: fallback.provider, fallbackModel: fallback.model }),
        ...(capUsd !== undefined && { perFeatureCapUsd: capUsd }),
      });
      flash(`${aiFeatureInfo(config.feature).name} now uses ${provider} / ${model}${capUsd !== undefined ? `, up to $${capUsd} a day` : ''}.`);
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
      flash(`${aiFeatureInfo(feature).name} is back on its default model.`);
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
          )}

          {budget && (
            <Card data-testid="ai-budget-form">
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="daily-cap">Daily cap (USD)</Label>
                    <Input id="daily-cap" inputMode="decimal" data-testid="ai-daily-cap-input" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="monthly-cap">Monthly cap (USD)</Label>
                    <Input id="monthly-cap" inputMode="decimal" data-testid="ai-monthly-cap-input" value={monthlyCap} onChange={(e) => setMonthlyCap(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="at-cap">When a cap is reached</Label>
                    <select
                      id="at-cap"
                      data-testid="ai-circuit-breaker-select"
                      value={atCap}
                      onChange={(e) => setAtCap(e.target.value === 'FALLBACK' ? 'FALLBACK' : 'FAIL_CLOSED')}
                      className="h-10 w-full rounded-lg border border-border bg-surface-bg px-3 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="FAIL_CLOSED">Stop AI until it resets</option>
                      <option value="FALLBACK">Use each feature&apos;s fallback model</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-content-muted" data-testid="ai-circuit-breaker-help">
                  A cap of 0 means no cap.{' '}
                  {atCap === 'FAIL_CLOSED'
                    ? 'Once a cap is reached, AI calls are refused until it resets.'
                    : 'Once a cap is reached, each feature switches to its cheaper fallback model.'}
                </p>
                {budgetError && (
                  <p role="alert" data-testid="ai-budget-form-error" className="text-sm text-status-critical">
                    {budgetError}
                  </p>
                )}
                <Button type="button" size="sm" data-testid="ai-save-cap" isLoading={savingBudget} onClick={saveCap}>
                  Save budget
                </Button>
              </CardContent>
            </Card>
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
                  <TableHead>If it fails or is over budget</TableHead>
                  <TableHead>Daily cap (USD)</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.filter((c) => isAiFeatureInUse(c.feature)).map((c) => (
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
                        type="password"
                        autoComplete="off"
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
