'use client';

import { KPI_DIRECTIONS, KPI_FREQUENCIES, KPI_SCOPES, KPI_TYPES, SCORECARD_QUADRANTS, type DraftProblem, type OnboardingDraftInput } from '@kpi-nexus/contracts';

import { DIRECTION_LABELS, FREQUENCY_LABELS, KPI_TYPE_LABELS, QUADRANT_LABELS, labelFor } from '../../../lib/labels';
import {
  type DraftKpiRow,
  categoryUsage,
  newKpi,
  renameCategory,
  setKpiField,
  setKpiScope,
  targetFromInput,
  toggleKpiUnit,
  topLevelUnitNames,
} from '../../../lib/wizard-kpis';
import { nameKey } from '../../../lib/wizard-structure';
import type { WizardStepId } from '../../../lib/wizard-steps';
import { fieldClass, labelClass } from './fields';
import { RowProblems, rowProblems } from './row-problems';

const SUGGESTED_CATEGORIES = ['Financial', 'Customer', 'Operations', 'People'];

/** What a KPI is recorded for, in the words the wizard uses. */
const SCOPE_CHOICES: Record<(typeof KPI_SCOPES)[number], string> = {
  ORG_WIDE: 'The whole organization',
  PER_UNIT: 'Each unit',
  PER_USER: 'Each person',
};

/** A target in the row's summary. The organisation's own number format does not exist yet: this is the default one. */
const TARGET_FIGURE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

export interface KpisStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  onChange: (patch: Partial<OnboardingDraftInput>) => void;
  onGo: (step: WizardStepId) => void;
}

/**
 * Step 4: what the organisation measures. Categories group KPIs; a KPI says
 * what it is recorded for (the organisation, each unit, each person), how
 * often, and which way is good. A per-unit KPI is held by the units chosen —
 * or the top-level ones — and by every unit under them.
 */
export function KpisStep({ draft, problems, onChange, onGo }: KpisStepProps) {
  const categories = draft.kpiCategories ?? [];
  const kpis = draft.kpis ?? [];
  const categoryNames = categories.map((c) => c.name.trim()).filter(Boolean);
  const unitNames = (draft.orgUnits ?? []).map((u) => u.name.trim()).filter(Boolean);
  const topLevel = topLevelUnitNames(draft);
  const unusedSuggestions = SUGGESTED_CATEGORIES.filter((s) => !categories.some((c) => nameKey(c.name) === nameKey(s)));
  const setKpi = (index: number, next: DraftKpiRow) => onChange({ kpis: kpis.map((k, i) => (i === index ? next : k)) });
  const addCategory = (name = '') => onChange({ kpiCategories: [...categories, { name }] });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          Categories <span className="font-normal text-content-muted">({categories.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">Groups of KPIs, such as Financial or Customer. Every KPI is in one.</p>

        <ul className="mt-3 space-y-2">
          {categories.map((category, index) => {
            const used = categoryUsage(draft, category.name);
            return (
              <li key={index}>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`kpi-category-name-${index}`}>
                    Category {index + 1}
                  </label>
                  <input
                    id={`kpi-category-name-${index}`}
                    data-testid={`kpi-category-name-${index}`}
                    value={category.name}
                    onChange={(e) => onChange(renameCategory(draft, index, e.target.value))}
                    placeholder="e.g. Financial"
                    autoFocus={category.name === '' && index === categories.length - 1}
                    aria-invalid={rowProblems(problems, 'kpiCategories', index).length > 0 || undefined}
                    className={`${fieldClass} mt-0 max-w-xs`}
                  />
                  <button
                    type="button"
                    data-testid={`kpi-category-remove-${index}`}
                    onClick={() => onChange({ kpiCategories: categories.filter((_, i) => i !== index) })}
                    disabled={used > 0}
                    title={used > 0 ? `${used} KPI${used === 1 ? ' is' : 's are'} in this category` : undefined}
                    aria-label={`Remove category ${category.name || index + 1}`}
                    className="rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-transparent"
                  >
                    Remove
                  </button>
                  {used > 0 && (
                    <span className="text-xs text-content-muted">
                      {used} KPI{used === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <RowProblems problems={problems} section="kpiCategories" index={index} testId={`kpi-category-problem-${index}`} />
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="kpi-category-add"
            onClick={() => addCategory()}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
          >
            + Add category
          </button>
          {unusedSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              data-testid={`kpi-category-suggest-${name}`}
              onClick={() => addCategory(name)}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-content-strong hover:bg-accent-primary/10"
            >
              + {name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          KPIs <span className="font-normal text-content-muted">({kpis.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">What you measure. You can add more, and change these, after setup.</p>

        <ul className="mt-3 space-y-3">
          {kpis.map((kpi, index) => {
            const scope = kpi.scope ?? 'ORG_WIDE';
            const named = kpi.units ?? [];
            const noUnits = rowProblems(problems, 'kpis', index, 'scope').length > 0;
            return (
              <li key={index} data-testid={`kpi-card-${index}`} className="rounded-md border border-border-divider bg-surface-bg p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_auto] sm:items-center">
                  <div>
                    <label className="sr-only" htmlFor={`kpi-name-${index}`}>
                      KPI name
                    </label>
                    <input
                      id={`kpi-name-${index}`}
                      data-testid={`kpi-name-${index}`}
                      value={kpi.name}
                      onChange={(e) => setKpi(index, { ...kpi, name: e.target.value })}
                      placeholder="e.g. Monthly revenue"
                      autoFocus={kpi.name === '' && index === kpis.length - 1}
                      aria-invalid={rowProblems(problems, 'kpis', index, 'name').length > 0 || undefined}
                      className={`${fieldClass} mt-0`}
                    />
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`kpi-category-${index}`}>
                      Category of {kpi.name || 'this KPI'}
                    </label>
                    <select
                      id={`kpi-category-${index}`}
                      data-testid={`kpi-category-${index}`}
                      value={categoryNames.find((c) => nameKey(c) === nameKey(kpi.category)) ?? ''}
                      onChange={(e) => setKpi(index, { ...kpi, category: e.target.value })}
                      aria-invalid={rowProblems(problems, 'kpis', index, 'category').length > 0 || undefined}
                      className={`${fieldClass} mt-0`}
                    >
                      {!categoryNames.some((c) => nameKey(c) === nameKey(kpi.category)) && <option value="">Choose a category</option>}
                      {categoryNames.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    data-testid={`kpi-remove-${index}`}
                    onClick={() => onChange({ kpis: kpis.filter((_, i) => i !== index) })}
                    aria-label={`Remove ${kpi.name || 'this KPI'}`}
                    className="rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                  >
                    Remove
                  </button>
                </div>
                <RowProblems problems={problems} section="kpis" index={index} testId={`kpi-problem-${index}`} />
                {noUnits && (
                  <button
                    type="button"
                    data-testid={`kpi-${index}-go-structure`}
                    onClick={() => onGo('structure')}
                    className="mt-1 text-xs font-medium text-accent-primary hover:underline"
                  >
                    Add units in Structure →
                  </button>
                )}

                <details className="mt-2" open={noUnits || undefined}>
                  <summary data-testid={`kpi-details-${index}`} className="cursor-pointer text-xs font-medium text-accent-primary">
                    {SCOPE_CHOICES[scope]} · {labelFor(FREQUENCY_LABELS, kpi.frequency ?? 'MONTHLY')} ·{' '}
                    {labelFor(DIRECTION_LABELS, kpi.direction ?? 'HIGHER_IS_BETTER')}
                    {/* Grouped, as the product writes numbers once the organisation exists: it read "target 500000". */}
                    {kpi.targetValue !== undefined && ` · target ${TARGET_FIGURE.format(kpi.targetValue)}${kpi.unit ? ` ${kpi.unit}` : ''}`}
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass} htmlFor={`kpi-scope-${index}`}>
                        Recorded for
                      </label>
                      <select
                        id={`kpi-scope-${index}`}
                        data-testid={`kpi-scope-${index}`}
                        value={scope}
                        onChange={(e) => setKpi(index, setKpiScope(kpi, e.target.value as (typeof KPI_SCOPES)[number]))}
                        className={fieldClass}
                      >
                        {KPI_SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {SCOPE_CHOICES[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-frequency-${index}`}>
                        How often
                      </label>
                      <select
                        id={`kpi-frequency-${index}`}
                        data-testid={`kpi-frequency-${index}`}
                        value={kpi.frequency ?? 'MONTHLY'}
                        onChange={(e) => setKpi(index, { ...kpi, frequency: e.target.value as (typeof KPI_FREQUENCIES)[number] })}
                        className={fieldClass}
                      >
                        {KPI_FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {labelFor(FREQUENCY_LABELS, f)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-direction-${index}`}>
                        Which way is good
                      </label>
                      <select
                        id={`kpi-direction-${index}`}
                        data-testid={`kpi-direction-${index}`}
                        value={kpi.direction ?? 'HIGHER_IS_BETTER'}
                        onChange={(e) => setKpi(index, { ...kpi, direction: e.target.value as (typeof KPI_DIRECTIONS)[number] })}
                        className={fieldClass}
                      >
                        {KPI_DIRECTIONS.map((d) => (
                          <option key={d} value={d}>
                            {labelFor(DIRECTION_LABELS, d)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-type-${index}`}>
                        Kind of value
                      </label>
                      <select
                        id={`kpi-type-${index}`}
                        data-testid={`kpi-type-${index}`}
                        value={kpi.type ?? 'NUMBER'}
                        onChange={(e) => setKpi(index, { ...kpi, type: e.target.value as (typeof KPI_TYPES)[number] })}
                        className={fieldClass}
                      >
                        {KPI_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {labelFor(KPI_TYPE_LABELS, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-unit-${index}`}>
                        Unit of measure
                      </label>
                      <input
                        id={`kpi-unit-${index}`}
                        data-testid={`kpi-unit-${index}`}
                        value={kpi.unit ?? ''}
                        onChange={(e) => setKpi(index, setKpiField(kpi, 'unit', e.target.value))}
                        placeholder="e.g. USD, %, days"
                        maxLength={40}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-target-${index}`}>
                        Target
                      </label>
                      <input
                        id={`kpi-target-${index}`}
                        data-testid={`kpi-target-${index}`}
                        type="number"
                        step="any"
                        value={kpi.targetValue ?? ''}
                        onChange={(e) => setKpi(index, setKpiField(kpi, 'targetValue', targetFromInput(e.target.value)))}
                        placeholder="Optional"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`kpi-quadrant-${index}`}>
                        Scorecard area
                      </label>
                      <select
                        id={`kpi-quadrant-${index}`}
                        data-testid={`kpi-quadrant-${index}`}
                        value={kpi.scorecardQuadrant ?? ''}
                        onChange={(e) => setKpi(index, setKpiField(kpi, 'scorecardQuadrant', e.target.value as (typeof SCORECARD_QUADRANTS)[number] | ''))}
                        className={fieldClass}
                      >
                        <option value="">Not on the scorecard</option>
                        {SCORECARD_QUADRANTS.map((q) => (
                          <option key={q} value={q}>
                            {labelFor(QUADRANT_LABELS, q)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor={`kpi-description-${index}`}>
                        Description
                      </label>
                      <input
                        id={`kpi-description-${index}`}
                        data-testid={`kpi-description-${index}`}
                        value={kpi.description ?? ''}
                        onChange={(e) => setKpi(index, setKpiField(kpi, 'description', e.target.value))}
                        placeholder="Optional — what it counts and where the number comes from"
                        maxLength={2000}
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  {scope === 'PER_UNIT' && unitNames.length > 0 && (
                    <fieldset className="mt-3">
                      <legend className={labelClass}>Held by</legend>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {unitNames.map((unit) => (
                          <label key={unit} className="flex items-center gap-2 text-xs text-content-default">
                            <input
                              type="checkbox"
                              data-testid={`kpi-${index}-unit-${unit}`}
                              checked={named.some((u) => nameKey(u) === nameKey(unit))}
                              onChange={() => setKpi(index, toggleKpiUnit(kpi, unit))}
                            />
                            {unit}
                          </label>
                        ))}
                      </div>
                      <p data-testid={`kpi-units-hint-${index}`} className="mt-1.5 text-xs text-content-muted">
                        {named.length === 0
                          ? `None chosen, so the top-level units hold it (${topLevel.join(', ')}), and so do the units below them.`
                          : 'The units chosen hold it, and so do the units below them.'}
                      </p>
                    </fieldset>
                  )}
                  {scope === 'PER_USER' && (
                    <p className="mt-3 text-xs text-content-muted">
                      Each person records their own value. You choose who holds it after setup, on the KPI&apos;s Assignments tab.
                    </p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            data-testid="kpi-add"
            onClick={() => onChange({ kpis: [...kpis, newKpi(draft)] })}
            disabled={categoryNames.length === 0}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add KPI
          </button>
          {categoryNames.length === 0 && <span className="text-xs text-content-muted">Add a category first.</span>}
        </div>
      </section>
    </div>
  );
}
