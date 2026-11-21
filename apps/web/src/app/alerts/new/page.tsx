'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Suspense, useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { Button, Card, Input, Label, Select } from '../../../components/ui';
import {
  ApiError,
  createAlertRule,
  getAccessToken,
  getAlertRule,
  updateAlertRule,
  listKpis,
  listNotificationChannels,
  listRoles,
  listUsers,
  type AlertSeverity,
  type EscalationLevelInput,
} from '../../../lib/api-client';
import {
  EMPTY_ALERT_RULE_FORM,
  OPERATOR_WORDS,
  RULE_TYPES,
  type AlertRuleForm,
  type FormRuleType,
  type Operator,
  type TimeUnit,
  alertRuleBody,
  alertRuleProblem,
  conditionSentence,
  formFromRule,
  levelSummary,
  toggleId,
} from '../../../lib/alert-rule-form';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { useAsyncData } from '../../../lib/use-async-data';
import { usePermissions } from '../../../lib/use-permissions';

const UNITS: TimeUnit[] = ['minutes', 'hours', 'days'];

function UnitSelect({ value, onChange, testId, label }: { value: TimeUnit; onChange: (unit: TimeUnit) => void; testId: string; label: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as TimeUnit)} data-testid={testId} aria-label={label} className="w-28">
      {UNITS.map((unit) => (
        <option key={unit} value={unit}>
          {unit}
        </option>
      ))}
    </Select>
  );
}

/** `useSearchParams` (the `?edit=` mode) needs a Suspense boundary at prerender time. */
export default function NewAlertRulePage() {
  return (
    <Suspense fallback={null}>
      <NewAlertRuleInner />
    </Suspense>
  );
}

function NewAlertRuleInner() {
  const router = useRouter();
  // `?edit=<id>`: the same form opens a saved rule (F-069: Edit offered only name, severity, description).
  const editId = useSearchParams().get('edit');
  const signedIn = typeof window !== 'undefined' && Boolean(getAccessToken());
  const { ready, has } = usePermissions();
  // Each list is asked for only by someone allowed to read it (FE-014).
  const allowed = signedIn && ready && has('KPI_EDIT');
  const existing = useAsyncData(() => getAlertRule(editId ?? ''), [editId], { enabled: allowed && Boolean(editId) });
  const kpis = useAsyncData(() => listKpis(), [], { enabled: allowed });
  const roles = useAsyncData(() => listRoles(), [], { enabled: allowed });
  const users = useAsyncData(() => listUsers(), [], { enabled: allowed && has('USERS_VIEW') });
  const channels = useAsyncData(() => listNotificationChannels(), [], { enabled: allowed && has('ORG_SETTINGS') });

  const [form, setForm] = useState<AlertRuleForm>(EMPTY_ALERT_RULE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
  }, [router]);

  // Start on the first KPI once the list arrives (a new rule only; an edited one has its own).
  const firstKpiId = kpis.data?.[0]?.id;
  useEffect(() => {
    if (firstKpiId && !editId) setForm((f) => (f.kpiId ? f : { ...f, kpiId: firstKpiId }));
  }, [firstKpiId, editId]);

  // The saved rule fills the form once it arrives.
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!editId || !existing.data || filledFrom === editId) return;
    const filled = formFromRule(existing.data);
    if (filled) setForm(filled);
    else setError('This kind of rule cannot be edited here.');
    setFilledFrom(editId);
  }, [editId, existing.data, filledFrom]);

  const set = <K extends keyof AlertRuleForm>(key: K, value: AlertRuleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: 'name' | 'description' | 'threshold' | 'sigmas' | 'windowSize' | 'percent' | 'windowValue' | 'staleValue' | 'cooldownValue') =>
    (e: { target: { value: string } }) => set(key, e.target.value);
  const updateLevel = (idx: number, patch: Partial<EscalationLevelInput>) =>
    set('levels', form.levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const activeUsers = (users.data ?? []).filter((u) => u.status === 'ACTIVE');
  const directory = { roles: roles.data ?? [], users: users.data ?? [], channels: channels.data ?? [] };
  const kpiName = kpis.data?.find((k) => k.id === form.kpiId)?.name;
  const ruleType = RULE_TYPES.find((t) => t.value === form.ruleType);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = alertRuleProblem(form);
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    try {
      if (editId) {
        // Everything is sent, so a cleared description or an emptied step list clears on the server too.
        await updateAlertRule(editId, { ...alertRuleBody(form), description: form.description.trim(), escalationLevels: form.levels });
      } else {
        await createAlertRule(alertRuleBody(form));
      }
      // Land on the rules list so the rule is visible (FE-006).
      router.push('/alerts/rules');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `The rule was not ${editId ? 'changed' : 'created'}. Try again.`);
      setSubmitting(false);
    }
  }

  // Creating a rule is KPI_EDIT on the API: the page asks for what its Save needs (UI-013).
  return (
    <RequirePermission permission="KPI_EDIT">
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-content-strong" data-testid="new-rule-heading">
          {editId ? 'Edit alert rule' : 'New alert rule'}
        </h1>
        <p className="mt-1 text-sm text-content-muted">Say what to watch for on a KPI, and who should hear about it.</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-5" data-testid="new-rule-form">
          <Card className="grid gap-5 p-5">
            <div className="grid gap-2">
              <Label htmlFor="rule-name" required>
                Name
              </Label>
              <Input id="rule-name" value={form.name} onChange={text('name')} data-testid="rule-name-input" placeholder="e.g. MRR below floor" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-description">What to do when it fires (optional)</Label>
              <Input
                id="rule-description"
                value={form.description}
                onChange={text('description')}
                maxLength={2000}
                data-testid="rule-description-input"
                placeholder="e.g. Check the pipeline, then tell finance"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-kpi" required>
                KPI
              </Label>
              <Select id="rule-kpi" value={form.kpiId} onChange={(e) => set('kpiId', e.target.value)} data-testid="rule-kpi-select">
                {(kpis.data ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
              {kpis.error && (
                <p className="text-xs text-status-critical" role="alert">
                  {kpis.error}{' '}
                  <button type="button" className="underline" onClick={kpis.reload}>
                    Try again
                  </button>
                </p>
              )}
              {kpis.data?.length === 0 && <p className="text-xs text-content-muted">There are no KPIs yet. Create one first.</p>}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rule-type">Alert when the KPI…</Label>
                <Select id="rule-type" value={form.ruleType} onChange={(e) => set('ruleType', e.target.value as FormRuleType)} data-testid="rule-type-select">
                  {RULE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-severity">Severity</Label>
                <Select id="rule-severity" value={form.severity} onChange={(e) => set('severity', e.target.value as AlertSeverity)} data-testid="rule-severity-select">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </Select>
              </div>
            </div>
          </Card>

          {/* Type-specific condition */}
          <Card className="p-5">
            <fieldset data-testid="rule-config">
              <legend className="kn-eyebrow mb-3">Condition</legend>
              {form.ruleType === 'STATIC_THRESHOLD' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-operator">The value</Label>
                    <Select id="rule-operator" value={form.operator} onChange={(e) => set('operator', e.target.value as Operator)} data-testid="rule-operator-select" className="w-44">
                      {(Object.keys(OPERATOR_WORDS) as Operator[]).map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_WORDS[op]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-threshold">This number</Label>
                    <Input id="rule-threshold" type="number" step="any" value={form.threshold} onChange={text('threshold')} data-testid="rule-threshold-input" className="w-40" />
                  </div>
                </div>
              )}
              {form.ruleType === 'DYNAMIC_STDDEV' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-sigmas">How far from usual (standard deviations)</Label>
                    <Input id="rule-sigmas" type="number" step="any" min={0} value={form.sigmas} onChange={text('sigmas')} data-testid="rule-sigmas-input" className="w-28" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-window">Compared with the last … values</Label>
                    <Input id="rule-window" type="number" min={2} value={form.windowSize} onChange={text('windowSize')} data-testid="rule-window-size-input" className="w-28" />
                  </div>
                </div>
              )}
              {form.ruleType === 'RATE_OF_CHANGE' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rule-direction">The value</Label>
                    <Select id="rule-direction" value={form.direction} onChange={(e) => set('direction', e.target.value as 'rise' | 'fall')} data-testid="rule-direction-select" className="w-28">
                      <option value="fall">falls</option>
                      <option value="rise">rises</option>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-pct">By at least (%)</Label>
                    <Input id="rule-pct" type="number" step="any" min={0} value={form.percent} onChange={text('percent')} data-testid="rule-percent-input" className="w-28" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rule-winval">Within</Label>
                    <div className="flex gap-2">
                      <Input id="rule-winval" type="number" min={1} value={form.windowValue} onChange={text('windowValue')} data-testid="rule-window-value" className="w-24" />
                      <UnitSelect value={form.windowUnit} onChange={(u) => set('windowUnit', u)} testId="rule-window-unit" label="Unit of the period" />
                    </div>
                  </div>
                </div>
              )}
              {form.ruleType === 'NO_DATA' && (
                <div className="grid gap-2">
                  <Label htmlFor="rule-stale">No value recorded for</Label>
                  <div className="flex gap-2">
                    <Input id="rule-stale" type="number" min={1} value={form.staleValue} onChange={text('staleValue')} data-testid="rule-stale-value" className="w-24" />
                    <UnitSelect value={form.staleUnit} onChange={(u) => set('staleUnit', u)} testId="rule-stale-unit" label="Unit of the time without a value" />
                  </div>
                </div>
              )}

              <p className="mt-4 text-sm font-medium text-content-strong" data-testid="rule-sentence">
                {conditionSentence(form, kpiName)}
              </p>
              {ruleType && <p className="mt-1 text-xs text-content-muted">{ruleType.about}</p>}

              <div className="mt-5 grid gap-2 border-t border-border-divider pt-4">
                <Label htmlFor="rule-cooldown">Once it has fired, stay quiet for (optional)</Label>
                <div className="flex gap-2">
                  <Input id="rule-cooldown" type="number" min={1} value={form.cooldownValue} onChange={text('cooldownValue')} data-testid="rule-cooldown-value" className="w-24" placeholder="—" />
                  <UnitSelect value={form.cooldownUnit} onChange={(u) => set('cooldownUnit', u)} testId="rule-cooldown-unit" label="Unit of the quiet period" />
                </div>
                <p className="text-xs text-content-muted">Left blank, every value that meets the condition raises a new alert.</p>
              </div>
            </fieldset>
          </Card>

          {/* Who to notify */}
          <Card className="p-5">
            <fieldset data-testid="escalation-builder">
              <legend className="kn-eyebrow mb-1">Who to notify (optional)</legend>
              <p className="mb-3 text-xs text-content-muted">
                The alert always appears on the Alerts page. Add a step to notify people in the app, or to send it to a channel. Later steps run only
                while nobody has acknowledged the alert.
              </p>
              <div className="grid gap-3">
                {form.levels.map((lvl, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-surface-1 p-4" data-testid={`escalation-level-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-content-strong">Step {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => set('levels', form.levels.filter((_, i) => i !== idx))}
                        data-testid={`escalation-remove-${idx}`}
                        className="text-status-critical hover:bg-status-critical-bg"
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Label htmlFor={`escalation-delay-${idx}`}>Wait (minutes after the alert)</Label>
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
                      <span className="kn-eyebrow">Everyone with a role</span>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        {(roles.data ?? []).map((role) => (
                          <label key={role.id} className="flex items-center gap-1.5 text-xs text-content">
                            <input
                              type="checkbox"
                              checked={lvl.notifyRoleIds.includes(role.id)}
                              onChange={() => updateLevel(idx, { notifyRoleIds: toggleId(lvl.notifyRoleIds, role.id) })}
                              data-testid={`escalation-${idx}-role-${role.name}`}
                              className="accent-[hsl(var(--accent-primary))]"
                            />
                            {role.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      <span className="kn-eyebrow">People</span>
                      {!users.data && !users.loading && (
                        <p className="mt-1 text-xs text-content-muted">
                          {users.error ?? 'Choosing individual people needs permission to see the people list. You can still choose roles.'}
                        </p>
                      )}
                      <div className="mt-2 flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
                        {activeUsers.map((user) => (
                          <label key={user.id} className="flex items-center gap-1.5 text-xs text-content">
                            <input
                              type="checkbox"
                              checked={lvl.notifyUserIds.includes(user.id)}
                              onChange={() => updateLevel(idx, { notifyUserIds: toggleId(lvl.notifyUserIds, user.id) })}
                              data-testid={`escalation-${idx}-user-${user.id}`}
                              className="accent-[hsl(var(--accent-primary))]"
                            />
                            {user.fullName}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      <span className="kn-eyebrow">Channels</span>
                      {(channels.data ?? []).length === 0 && (
                        <p className="mt-1 text-xs text-content-muted">
                          {ready && has('ORG_SETTINGS')
                            ? 'No channels yet — create one under Channels to send email, Slack, Teams or a webhook.'
                            : 'Notification channels are managed by an administrator.'}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3">
                        {(channels.data ?? []).map((ch) => (
                          <label key={ch.id} className="flex items-center gap-1.5 text-xs text-content">
                            <input
                              type="checkbox"
                              checked={lvl.channelIds.includes(ch.id)}
                              onChange={() => updateLevel(idx, { channelIds: toggleId(lvl.channelIds, ch.id) })}
                              data-testid={`escalation-${idx}-channel-${ch.id}`}
                              className="accent-[hsl(var(--accent-primary))]"
                            />
                            {ch.name} ({ch.kind})
                          </label>
                        ))}
                      </div>
                    </div>

                    <p className="mt-4 border-t border-border-divider pt-3 text-sm text-content-strong" data-testid={`escalation-${idx}-summary`}>
                      {levelSummary(lvl, directory)}
                    </p>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      set('levels', [
                        ...form.levels,
                        { delayMinutes: form.levels.length === 0 ? 0 : 30, channelIds: [], notifyRoleIds: [], notifyUserIds: [] },
                      ])
                    }
                    data-testid="escalation-add-level"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    {form.levels.length === 0 ? 'Add people to notify' : 'Add a later step'}
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
