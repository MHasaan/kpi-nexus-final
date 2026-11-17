'use client';

import type { DraftProblem, OnboardingDraftInput } from '@kpi-nexus/contracts';

import { nameKey, parentChoices, removeUnit, renameUnit, renameUnitType, unitTreeRows, unitTypeUsage } from '../../../lib/wizard-structure';
import { fieldClass } from './fields';
import { RowProblems, rowProblems } from './row-problems';

const SUGGESTED_TYPES = ['Department', 'Team', 'Region'];

export interface StructureStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  onChange: (patch: Partial<OnboardingDraftInput>) => void;
}

/**
 * Step 2: the organisation's shape. Unit types name the kinds of unit there
 * are; units are the departments and teams themselves, each optionally under
 * another. Units are what per-unit KPIs are recorded for and what people
 * belong to, so a rename or a removal here is carried through to both.
 */
export function StructureStep({ draft, problems, onChange }: StructureStepProps) {
  const types = draft.orgUnitTypes ?? [];
  const units = draft.orgUnits ?? [];
  const rows = unitTreeRows(units);
  const typeNames = types.map((t) => t.name.trim()).filter(Boolean);
  const unusedSuggestions = SUGGESTED_TYPES.filter((s) => !types.some((t) => nameKey(t.name) === nameKey(s)));

  const addType = (name = '') => onChange({ orgUnitTypes: [...types, { name }] });
  const addUnit = () => onChange({ orgUnits: [...units, { name: '', type: typeNames[0] ?? '' }] });
  const setUnit = (index: number, change: { type?: string; parent?: string }) =>
    onChange({
      orgUnits: units.map((u, i) => {
        if (i !== index) return u;
        const next = { ...u, ...change };
        if (!next.parent) delete next.parent;
        return next;
      }),
    });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          Unit types <span className="font-normal text-content-muted">({types.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">The kinds of unit you have — for example Department, Team or Region.</p>

        <ul className="mt-3 space-y-2">
          {types.map((type, index) => {
            const used = unitTypeUsage(draft, type.name);
            return (
              <li key={index}>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`unit-type-name-${index}`}>
                    Unit type {index + 1}
                  </label>
                  <input
                    id={`unit-type-name-${index}`}
                    data-testid={`unit-type-name-${index}`}
                    value={type.name}
                    onChange={(e) => onChange(renameUnitType(draft, index, e.target.value))}
                    placeholder="e.g. Department"
                    autoFocus={type.name === '' && index === types.length - 1}
                    aria-invalid={rowProblems(problems, 'orgUnitTypes', index).length > 0 || undefined}
                    className={`${fieldClass} mt-0 max-w-xs`}
                  />
                  <button
                    type="button"
                    data-testid={`unit-type-remove-${index}`}
                    onClick={() => onChange({ orgUnitTypes: types.filter((_, i) => i !== index) })}
                    disabled={used > 0}
                    title={used > 0 ? `${used} unit${used === 1 ? ' is' : 's are'} of this type` : undefined}
                    aria-label={`Remove unit type ${type.name || index + 1}`}
                    className="rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-transparent"
                  >
                    Remove
                  </button>
                  {used > 0 && (
                    <span className="text-xs text-content-muted">
                      used by {used} unit{used === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <RowProblems problems={problems} section="orgUnitTypes" index={index} testId={`unit-type-problem-${index}`} />
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="unit-type-add"
            onClick={() => addType()}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
          >
            + Add unit type
          </button>
          {unusedSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              data-testid={`unit-type-suggest-${name}`}
              onClick={() => addType(name)}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-content-strong hover:bg-accent-primary/10"
            >
              + {name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          Units <span className="font-normal text-content-muted">({units.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">
          Your departments and teams. KPIs can be recorded per unit, and a unit placed under another inherits its KPIs.
        </p>

        {units.length > 0 && (
          <div className="mt-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2 text-xs font-medium text-content-muted sm:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Under</span>
            <span className="w-16" />
          </div>
        )}
        <ul className="mt-1 space-y-2">
          {rows.map(({ unit, index, depth }) => (
            <li key={index} data-testid={`unit-row-${index}`} data-depth={depth}>
              <div
                className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-center"
                style={{ paddingInlineStart: depth * 20 }}
              >
                <div>
                  <label className="sr-only" htmlFor={`unit-name-${index}`}>
                    Unit name
                  </label>
                  <input
                    id={`unit-name-${index}`}
                    data-testid={`unit-name-${index}`}
                    value={unit.name}
                    onChange={(e) => onChange(renameUnit(draft, index, e.target.value))}
                    placeholder="e.g. Engineering"
                    autoFocus={unit.name === '' && index === units.length - 1}
                    aria-invalid={rowProblems(problems, 'orgUnits', index, 'name').length > 0 || undefined}
                    className={`${fieldClass} mt-0`}
                  />
                </div>
                <div>
                  <label className="sr-only" htmlFor={`unit-type-${index}`}>
                    Type of {unit.name || 'this unit'}
                  </label>
                  <select
                    id={`unit-type-${index}`}
                    data-testid={`unit-type-${index}`}
                    value={typeNames.find((t) => nameKey(t) === nameKey(unit.type)) ?? ''}
                    onChange={(e) => setUnit(index, { type: e.target.value })}
                    aria-invalid={rowProblems(problems, 'orgUnits', index, 'type').length > 0 || undefined}
                    className={`${fieldClass} mt-0`}
                  >
                    {!typeNames.some((t) => nameKey(t) === nameKey(unit.type)) && <option value="">Choose a type</option>}
                    {typeNames.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="sr-only" htmlFor={`unit-parent-${index}`}>
                    {unit.name || 'This unit'} sits under
                  </label>
                  <select
                    id={`unit-parent-${index}`}
                    data-testid={`unit-parent-${index}`}
                    value={parentChoices(units, index).find((p) => nameKey(p) === nameKey(unit.parent)) ?? ''}
                    onChange={(e) => setUnit(index, { parent: e.target.value })}
                    className={`${fieldClass} mt-0`}
                  >
                    <option value="">Top level</option>
                    {parentChoices(units, index).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  data-testid={`unit-remove-${index}`}
                  onClick={() => onChange(removeUnit(draft, index))}
                  aria-label={`Remove ${unit.name || 'this unit'}`}
                  className="w-16 rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                >
                  Remove
                </button>
              </div>
              <div style={{ paddingInlineStart: depth * 20 }}>
                <RowProblems problems={problems} section="orgUnits" index={index} testId={`unit-problem-${index}`} />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            data-testid="unit-add"
            onClick={addUnit}
            disabled={typeNames.length === 0}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add unit
          </button>
          {typeNames.length === 0 && <span className="text-xs text-content-muted">Add a unit type first.</span>}
        </div>
      </section>
    </div>
  );
}
