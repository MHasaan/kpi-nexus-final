'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  ApiError,
  createKpi,
  listKpiCategories,
  listOrgUnits,
  listUsers,
  updateKpi,
  type KpiCategory,
  type KpiDirection,
  type KpiFrequency,
  type KpiScope,
  type KpiStatus,
  type KpiType,
  type KpiWriteBody,
  type OrgUnitSummary,
  type UserSummary,
} from '../../lib/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Textarea,
} from '../ui';

// ---------------------------------------------------------------------------
// Enum option tables (labels confirmed against api-client contracts)
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: Array<{ value: KpiScope; label: string }> = [
  { value: 'ORG_WIDE', label: 'Org-wide — one shared value for the whole org' },
  { value: 'PER_UNIT', label: 'Per unit — each org unit records its own value' },
  { value: 'PER_USER', label: 'Per user — each assigned person records their own value' },
];

const TYPE_OPTIONS: Array<{ value: KpiType; label: string }> = [
  { value: 'NUMBER', label: 'Number' },
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'CURRENCY', label: 'Currency' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'COUNT', label: 'Count' },
  { value: 'RATING', label: 'Rating' },
  { value: 'BOOLEAN', label: 'Boolean' },
];

const DIRECTION_OPTIONS: Array<{ value: KpiDirection; label: string }> = [
  { value: 'HIGHER_IS_BETTER', label: 'Higher is better' },
  { value: 'LOWER_IS_BETTER', label: 'Lower is better' },
  { value: 'TARGET_IS_BEST', label: 'On-target is best' },
  { value: 'NEUTRAL', label: 'Neutral (no preference)' },
];

const FREQUENCY_OPTIONS: Array<{ value: KpiFrequency; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'CUSTOM', label: 'Custom' },
  { value: 'REAL_TIME', label: 'Real-time' },
  { value: 'AD_HOC', label: 'Ad hoc' },
];

const AGGREGATION_OPTIONS: string[] = [
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'MEDIAN',
  'P25',
  'P75',
  'P90',
  'P95',
  'P99',
  'LAST',
  'FIRST',
  'COUNT',
  'COUNT_DISTINCT',
  'STDEV',
];

const STATUS_OPTIONS: Array<{ value: KpiStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PROPOSED', label: 'Proposed' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'DEPRECATED', label: 'Deprecated' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const QUADRANT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'INTERNAL_PROCESS', label: 'Internal process' },
  { value: 'LEARNING_GROWTH', label: 'Learning & growth' },
];

// ---------------------------------------------------------------------------
// Form value model
// ---------------------------------------------------------------------------

export interface KpiFormValues {
  name: string;
  description: string;
  unit: string;
  categoryId: string;
  ownerUserId: string;
  tags: string;
  type: KpiType;
  direction: KpiDirection;
  frequency: KpiFrequency;
  aggregationMethod: string;
  scope: KpiScope;
  orgUnitIds: string[];
  userIds: string[];
  targetValue: string;
  warningThreshold: string;
  criticalThreshold: string;
  allowNegative: boolean;
  scorecardQuadrant: string;
  status: KpiStatus;
}

/**
 * Partial seed for the form. Accepts either a `KpiSummary`-shaped object
 * (edit mode) or a loose template-derived shape (create mode). Numbers are
 * coerced to the string inputs the form uses.
 */
export interface KpiFormInitial {
  name?: string | null;
  description?: string | null;
  unit?: string | null;
  categoryId?: string | null;
  ownerUserId?: string | null;
  tags?: string[] | null;
  type?: KpiType | string | null;
  direction?: KpiDirection | string | null;
  frequency?: KpiFrequency | string | null;
  aggregationMethod?: string | null;
  scope?: KpiScope | string | null;
  targetValue?: number | string | null;
  warningThreshold?: number | string | null;
  criticalThreshold?: number | string | null;
  allowNegative?: boolean | null;
  scorecardQuadrant?: string | null;
  status?: KpiStatus | string | null;
  orgUnitAssignments?: Array<{ orgUnitId: string }>;
  userAssignments?: Array<{ userId: string }>;
}

function toNumStr(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

function buildInitialValues(initial?: KpiFormInitial): KpiFormValues {
  return {
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    unit: initial?.unit ?? '',
    categoryId: initial?.categoryId ?? '',
    ownerUserId: initial?.ownerUserId ?? '',
    tags: (initial?.tags ?? []).join(', '),
    type: (initial?.type as KpiType) ?? 'NUMBER',
    direction: (initial?.direction as KpiDirection) ?? 'HIGHER_IS_BETTER',
    frequency: (initial?.frequency as KpiFrequency) ?? 'MONTHLY',
    aggregationMethod: initial?.aggregationMethod ?? 'LAST',
    scope: (initial?.scope as KpiScope) ?? 'ORG_WIDE',
    orgUnitIds: (initial?.orgUnitAssignments ?? []).map((a) => a.orgUnitId),
    userIds: (initial?.userAssignments ?? []).map((a) => a.userId),
    targetValue: toNumStr(initial?.targetValue),
    warningThreshold: toNumStr(initial?.warningThreshold),
    criticalThreshold: toNumStr(initial?.criticalThreshold),
    allowNegative: initial?.allowNegative ?? false,
    scorecardQuadrant: initial?.scorecardQuadrant ?? '',
    status: (initial?.status as KpiStatus) ?? 'DRAFT',
  };
}

/** Strict numeric parse — returns undefined for blank/invalid (no truncation). */
function parseNum(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  eyebrow,
  help,
  children,
}: {
  eyebrow: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="kn-eyebrow">{eyebrow}</p>
          <p className="mt-0.5 text-xs text-content-muted">{help}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  help,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {help && <p className="text-xs text-content-muted">{help}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiForm
// ---------------------------------------------------------------------------

export interface KpiFormProps {
  mode: 'create' | 'edit';
  /** Existing KPI id — required in edit mode. */
  kpiId?: string;
  initial?: KpiFormInitial;
  /** Suggested-target hint (e.g. template `targetSummary`). */
  templateHint?: string | null;
  onDone: (kpiId: string) => void;
}

export function KpiForm({ mode, kpiId, initial, templateHint, onDone }: KpiFormProps) {
  const [values, setValues] = useState<KpiFormValues>(() => buildInitialValues(initial));
  const [categories, setCategories] = useState<KpiCategory[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pickers.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listKpiCategories(), listUsers(), listOrgUnits()]).then((results) => {
      if (cancelled) return;
      if (results[0].status === 'fulfilled') setCategories(results[0].value);
      if (results[1].status === 'fulfilled') setUsers(results[1].value);
      if (results[2].status === 'fulfilled') setOrgUnits(results[2].value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof KpiFormValues>(key: K, value: KpiFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggleId = (key: 'orgUnitIds' | 'userIds', id: string, checked: boolean) =>
    setValues((prev) => {
      const current = new Set(prev[key]);
      if (checked) current.add(id);
      else current.delete(id);
      return { ...prev, [key]: Array.from(current) };
    });

  const isEdit = mode === 'edit';
  const parsedTags = parseTags(values.tags);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = values.name.trim();
    if (name.length < 2) {
      setError('Name is required (at least 2 characters).');
      return;
    }

    // Shared editable fields.
    const base: Partial<KpiWriteBody> = {
      name,
      description: values.description.trim() || undefined,
      unit: values.unit.trim() || undefined,
      categoryId: values.categoryId || undefined,
      ownerUserId: values.ownerUserId || undefined,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      type: values.type,
      direction: values.direction,
      frequency: values.frequency,
      aggregationMethod: values.aggregationMethod || undefined,
      targetValue: parseNum(values.targetValue),
      warningThreshold: parseNum(values.warningThreshold),
      criticalThreshold: parseNum(values.criticalThreshold),
      allowNegative: values.allowNegative,
      scorecardQuadrant: values.scorecardQuadrant || undefined,
      status: values.status,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        if (!kpiId) throw new Error('Missing KPI id');
        // Scope + assignments are immutable in edit mode — never sent.
        const result = await updateKpi(kpiId, base);
        onDone(result.id);
      } else {
        const body: KpiWriteBody = {
          ...base,
          name,
          scope: values.scope,
        };
        if (values.scope === 'PER_UNIT' && values.orgUnitIds.length > 0) {
          body.orgUnitIds = values.orgUnitIds;
        }
        if (values.scope === 'PER_USER' && values.userIds.length > 0) {
          body.userIds = values.userIds;
        }
        const result = await createKpi(body);
        onDone(result.id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save KPI.');
      setSubmitting(false);
    }
  }

  const cancelHref = isEdit && kpiId ? `/kpis/${kpiId}` : '/kpis';
  const scopeLabel = SCOPE_OPTIONS.find((s) => s.value === values.scope)?.label ?? values.scope;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="kpi-form">
      {/* Basics */}
      <Section eyebrow="Basics" help="Name your KPI and give it context.">
        <Field label="Name" htmlFor="kpi-name" required>
          <Input
            id="kpi-name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            required
            minLength={2}
            placeholder="e.g. Monthly Recurring Revenue"
            data-testid="kpi-name"
          />
        </Field>
        <Field label="Description" htmlFor="kpi-description" help="What does this KPI measure and why?">
          <Textarea
            id="kpi-description"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Optional"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="kpi-category">
            <Select
              id="kpi-category"
              value={values.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              data-testid="kpi-category"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner" htmlFor="kpi-owner">
            <Select
              id="kpi-owner"
              value={values.ownerUserId}
              onChange={(e) => set('ownerUserId', e.target.value)}
              data-testid="kpi-owner"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Tags" htmlFor="kpi-tags" help="Comma-separated, e.g. revenue, north-star">
          <Input
            id="kpi-tags"
            value={values.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="revenue, growth"
            data-testid="kpi-tags"
          />
          {parsedTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {parsedTags.map((t) => (
                <Badge key={t} tone="neutral">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </Field>
      </Section>

      {/* Measurement */}
      <Section eyebrow="Measurement" help="How this KPI is measured, aggregated, and scoped.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="kpi-type">
            <Select
              id="kpi-type"
              value={values.type}
              onChange={(e) => set('type', e.target.value as KpiType)}
              data-testid="kpi-type"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit" htmlFor="kpi-unit" help='e.g. "$", "%", "ms"'>
            <Input
              id="kpi-unit"
              value={values.unit}
              onChange={(e) => set('unit', e.target.value)}
              placeholder="%"
              data-testid="kpi-unit"
            />
          </Field>
          <Field label="Direction" htmlFor="kpi-direction" help="Is higher or lower better?">
            <Select
              id="kpi-direction"
              value={values.direction}
              onChange={(e) => set('direction', e.target.value as KpiDirection)}
              data-testid="kpi-direction"
            >
              {DIRECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frequency" htmlFor="kpi-frequency">
            <Select
              id="kpi-frequency"
              value={values.frequency}
              onChange={(e) => set('frequency', e.target.value as KpiFrequency)}
              data-testid="kpi-frequency"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Aggregation method"
            htmlFor="kpi-aggregation"
            help="How multiple data points roll up into a period value."
          >
            <Select
              id="kpi-aggregation"
              value={values.aggregationMethod}
              onChange={(e) => set('aggregationMethod', e.target.value)}
              data-testid="kpi-aggregation"
            >
              {AGGREGATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Scope */}
        {isEdit ? (
          <Field label="Scope">
            <p
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-content-strong"
              data-testid="kpi-scope-static"
            >
              {scopeLabel}
            </p>
            <p className="text-xs text-content-muted">Scope can&apos;t be changed after creation.</p>
          </Field>
        ) : (
          <Field label="Scope" htmlFor="kpi-scope" help="Who records data for this KPI.">
            <Select
              id="kpi-scope"
              value={values.scope}
              onChange={(e) => set('scope', e.target.value as KpiScope)}
              data-testid="kpi-scope"
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Assignment pickers — create mode only. */}
        {!isEdit && values.scope === 'PER_UNIT' && (
          <div data-testid="kpi-orgunit-picker">
            <p className="kn-eyebrow mb-2">Assign org units</p>
            {orgUnits.length === 0 ? (
              <p className="text-xs text-content-muted">
                No org units yet.{' '}
                <Link href="/org-units" className="text-accent-primary hover:underline">
                  Create one
                </Link>{' '}
                first, or create the KPI and assign later.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {orgUnits.map((u) => (
                  <label key={u.id} className="inline-flex items-center gap-2 text-sm text-content-default">
                    <input
                      type="checkbox"
                      checked={values.orgUnitIds.includes(u.id)}
                      onChange={(e) => toggleId('orgUnitIds', u.id, e.target.checked)}
                      className="h-4 w-4 rounded border-border-strong accent-accent-primary"
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {!isEdit && values.scope === 'PER_USER' && (
          <div data-testid="kpi-user-picker">
            <p className="kn-eyebrow mb-2">Assign users</p>
            {users.length === 0 ? (
              <p className="text-xs text-content-muted">
                No users yet.{' '}
                <Link href="/users" className="text-accent-primary hover:underline">
                  Invite someone
                </Link>{' '}
                first, or create the KPI and assign later.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {users.map((u) => (
                  <label key={u.id} className="inline-flex items-center gap-2 text-sm text-content-default">
                    <input
                      type="checkbox"
                      checked={values.userIds.includes(u.id)}
                      onChange={(e) => toggleId('userIds', u.id, e.target.checked)}
                      className="h-4 w-4 rounded border-border-strong accent-accent-primary"
                    />
                    {u.fullName}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Target & thresholds */}
      <Section eyebrow="Target & thresholds" help="Set the goal and the bands that flag trouble.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Target value"
            htmlFor="kpi-target"
            help={templateHint ? `Suggested: ${templateHint}` : undefined}
          >
            <Input
              id="kpi-target"
              value={values.targetValue}
              onChange={(e) => set('targetValue', e.target.value)}
              type="number"
              step="any"
              data-testid="kpi-target"
            />
          </Field>
          <Field label="Warning threshold" htmlFor="kpi-warning">
            <Input
              id="kpi-warning"
              value={values.warningThreshold}
              onChange={(e) => set('warningThreshold', e.target.value)}
              type="number"
              step="any"
              data-testid="kpi-warning"
            />
          </Field>
          <Field label="Critical threshold" htmlFor="kpi-critical">
            <Input
              id="kpi-critical"
              value={values.criticalThreshold}
              onChange={(e) => set('criticalThreshold', e.target.value)}
              type="number"
              step="any"
              data-testid="kpi-critical"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-content-default">
            <input
              type="checkbox"
              checked={values.allowNegative}
              onChange={(e) => set('allowNegative', e.target.checked)}
              className="h-4 w-4 rounded border-border-strong accent-accent-primary"
              data-testid="kpi-allow-negative"
            />
            Allow negative values
          </label>
          <Field label="Scorecard quadrant" htmlFor="kpi-quadrant">
            <Select
              id="kpi-quadrant"
              value={values.scorecardQuadrant}
              onChange={(e) => set('scorecardQuadrant', e.target.value)}
              data-testid="kpi-quadrant"
            >
              <option value="">None</option>
              {QUADRANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      {/* Status */}
      <Section eyebrow="Status" help="Draft KPIs are hidden from most views until Active.">
        <Field label="Status" htmlFor="kpi-status">
          <Select
            id="kpi-status"
            value={values.status}
            onChange={(e) => set('status', e.target.value as KpiStatus)}
            data-testid="kpi-status"
            className="sm:max-w-xs"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      {error && (
        <p
          role="alert"
          data-testid="kpi-form-error"
          className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={submitting} data-testid="kpi-submit">
          {isEdit ? 'Save changes' : 'Create KPI'}
        </Button>
        <Link
          href={cancelHref}
          className="text-sm text-content-muted hover:text-content-strong"
          data-testid="kpi-cancel"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
