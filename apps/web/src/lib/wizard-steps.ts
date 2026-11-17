import type { DraftProblem, DraftSection, OnboardingDraftInput } from '@kpi-nexus/contracts';

/**
 * The setup wizard's steps, in order. Each owns the draft sections it edits,
 * which is how a problem found anywhere in the draft is traced back to the
 * step where it can be fixed.
 */
export const WIZARD_STEPS = [
  { id: 'organization', label: 'Organization', hint: 'Name and basics', sections: ['organization'] },
  { id: 'structure', label: 'Structure', hint: 'Units and how they nest', sections: ['orgUnitTypes', 'orgUnits'] },
  { id: 'roles', label: 'Roles & positions', hint: 'Who can do what', sections: ['roles', 'positions'] },
  { id: 'kpis', label: 'KPIs', hint: 'What you measure', sections: ['kpiCategories', 'kpis'] },
  { id: 'team', label: 'Team', hint: 'People to invite', sections: ['team'] },
  { id: 'review', label: 'Review & finish', hint: 'Check and create', sections: [] },
] as const satisfies ReadonlyArray<{ id: string; label: string; hint: string; sections: readonly DraftSection[] }>;

export type WizardStep = (typeof WIZARD_STEPS)[number];
export type WizardStepId = WizardStep['id'];

const FIRST: WizardStepId = 'organization';

/**
 * Quick start is two steps — name the organisation, create the account — with
 * the four in between there but optional. Full setup (and a template, which
 * has already filled them) walks through all six.
 */
export type WizardMode = 'quick' | 'full';

export function wizardMode(entryMode: string | null | undefined): WizardMode {
  return entryMode === 'quick' ? 'quick' : 'full';
}

/** Whether a step can be skipped in this mode. */
export function isOptionalStep(id: WizardStepId, mode: WizardMode): boolean {
  return mode === 'quick' && id !== 'organization' && id !== 'review';
}

/** The step a `?step=` value names; anything else is the first step. */
export function stepFromParam(param: string | null | undefined): WizardStepId {
  return WIZARD_STEPS.find((s) => s.id === param)?.id ?? FIRST;
}

/**
 * The steps before and after this one (null at either end). In quick mode the
 * first step leads straight to the last and back; an optional step someone
 * chose to open still leads on in order.
 */
export function stepNeighbours(id: WizardStepId, mode: WizardMode = 'full'): { prev: WizardStepId | null; next: WizardStepId | null } {
  if (mode === 'quick' && id === 'organization') return { prev: null, next: 'review' };
  if (mode === 'quick' && id === 'review') return { prev: 'organization', next: null };
  const index = WIZARD_STEPS.findIndex((s) => s.id === id);
  return {
    prev: index > 0 ? WIZARD_STEPS[index - 1]!.id : null,
    next: index < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[index + 1]!.id : null,
  };
}

/** The step where a problem in this draft section is fixed. */
export function stepOfSection(section: DraftSection): WizardStepId {
  return WIZARD_STEPS.find((s) => (s.sections as readonly DraftSection[]).includes(section))?.id ?? FIRST;
}

/** Problems grouped by the step that fixes them (every step present, possibly empty). */
export function problemsByStep(problems: readonly DraftProblem[]): Record<WizardStepId, DraftProblem[]> {
  const grouped = Object.fromEntries(WIZARD_STEPS.map((s) => [s.id, [] as DraftProblem[]])) as Record<WizardStepId, DraftProblem[]>;
  for (const problem of problems) grouped[stepOfSection(problem.section)].push(problem);
  return grouped;
}

export interface DraftCounts {
  roles: number;
  positions: number;
  orgUnits: number;
  kpiCategories: number;
  kpis: number;
  team: number;
}

export function draftCounts(draft: OnboardingDraftInput | null | undefined): DraftCounts {
  return {
    roles: draft?.roles?.length ?? 0,
    positions: draft?.positions?.length ?? 0,
    orgUnits: draft?.orgUnits?.length ?? 0,
    kpiCategories: draft?.kpiCategories?.length ?? 0,
    kpis: draft?.kpis?.length ?? 0,
    team: draft?.team?.length ?? 0,
  };
}

/** A URL-safe organisation address from its name: "Acme Inc." → "acme-inc". */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
