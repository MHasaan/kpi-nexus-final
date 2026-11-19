'use client';

import type { DraftProblem } from '@kpi-nexus/contracts';

import { type DraftCounts, WIZARD_STEPS, type WizardMode, type WizardStepId, isOptionalStep } from '../../../lib/wizard-steps';

/** What each step holds, shown under its name: `[one of it, several of it, count key]`. */
const STEP_COUNTS: Partial<Record<WizardStepId, ReadonlyArray<readonly [string, string, keyof DraftCounts]>>> = {
  structure: [['unit', 'units', 'orgUnits']],
  roles: [
    ['role', 'roles', 'roles'],
    ['position', 'positions', 'positions'],
  ],
  kpis: [
    ['KPI', 'KPIs', 'kpis'],
    ['category', 'categories', 'kpiCategories'],
  ],
  team: [['person', 'people', 'team']],
};

export interface StepRailProps {
  current: WizardStepId;
  counts: DraftCounts;
  problems: Record<WizardStepId, DraftProblem[]>;
  /** Quick start marks the four steps in between as optional. */
  mode?: WizardMode;
  onGo: (step: WizardStepId) => void;
}

/**
 * Where you are in setup, what each step already holds, and which steps still
 * have something wrong. A column beside the step on wide screens, a strip
 * above it on narrow ones. Every step is reachable at any time: the order is a
 * suggestion, not a gate.
 */
export function StepRail({ current, counts, problems, mode = 'full', onGo }: StepRailProps) {
  return (
    <nav aria-label="Setup steps" data-testid="wizard-steps">
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {WIZARD_STEPS.map((step, index) => {
          const active = step.id === current;
          const wrong = problems[step.id].length;
          const held = STEP_COUNTS[step.id] ?? [];
          return (
            <li key={step.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                data-testid={`wizard-step-${step.id}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => onGo(step.id)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                  active
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-transparent hover:border-border hover:bg-surface-1'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    active ? 'bg-accent-primary text-white' : 'bg-surface-2 text-content-muted'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-content-strong">
                    {step.label}
                    {wrong > 0 && (
                      <span
                        data-testid={`wizard-step-problems-${step.id}`}
                        title={`${wrong} thing${wrong === 1 ? '' : 's'} to fix`}
                        className="rounded-full bg-status-critical px-1.5 text-[11px] font-semibold leading-4 text-white"
                      >
                        {wrong}
                      </span>
                    )}
                    {wrong > 0 && <span className="sr-only">to fix</span>}
                    {isOptionalStep(step.id, mode) && (
                      <span className="rounded bg-surface-2 px-1.5 text-[10px] font-medium uppercase tracking-wide text-content-muted">Optional</span>
                    )}
                  </span>
                  <span className="block text-xs text-content-muted">
                    {held.length === 0
                      ? step.hint
                      : held.map(([one, several, key], i) => (
                          <span key={key}>
                            {i > 0 && ' · '}
                            <span data-testid={`count-${key}`} className="tabular-nums">
                              {counts[key]}
                            </span>{' '}
                            {counts[key] === 1 ? one : several}
                          </span>
                        ))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
