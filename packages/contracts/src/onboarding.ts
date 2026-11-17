import { z } from 'zod';

import { ALL_PERMISSIONS } from './permissions.js';

/**
 * The onboarding draft: what someone has told the setup wizard so far, before
 * any organisation exists. It is written by the wizard's own steps, by a
 * template, and by the AI co-pilot, and read by `complete`, which turns it into
 * a real organisation.
 *
 * Two levels of checking, because a draft is edited a keystroke at a time:
 *
 * - `OnboardingDraftPatchSchema` — the shape. Every write goes through it. A
 *   half-typed row (an empty name) is fine; a section that is not a list, an
 *   enum value that does not exist, or an unknown section is not.
 * - `validateOnboardingDraft` — whether the draft can become an organisation:
 *   names present and unique, references resolve, an administrator role exists.
 *   Returned as a list of problems that say where they are.
 */

export const KPI_SCOPES = ['ORG_WIDE', 'PER_UNIT', 'PER_USER'] as const;
export const KPI_TYPES = ['NUMBER', 'PERCENTAGE', 'CURRENCY', 'DURATION', 'COUNT', 'RATING', 'BOOLEAN'] as const;
export const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_IS_BEST', 'NEUTRAL'] as const;
export const KPI_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
  'REAL_TIME',
  'AD_HOC',
] as const;
export const SCORECARD_QUADRANTS = ['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH'] as const;
/** `IC` is the stored value; `INDIVIDUAL_CONTRIBUTOR` is what templates and the AI write. Both are accepted. */
export const POSITION_TRACKS = ['MANAGEMENT', 'INDIVIDUAL_CONTRIBUTOR', 'IC', 'EXECUTIVE'] as const;

/** The most rows one section may hold. Far above any real organisation; stops a draft being used as storage. */
export const DRAFT_SECTION_MAX = 500;

const name = z.string().max(160);
const shortText = z.string().max(120);

export const DraftOrganizationSchema = z.object({
  name: z.string().max(200).optional(),
  industry: shortText.optional(),
  type: shortText.optional(),
  sizeTier: z.string().max(40).optional(),
});

export const DraftRoleSchema = z.object({
  name,
  isAdmin: z.boolean().default(false),
  level: z.number().int().min(0).max(1000).default(1),
  color: z.string().max(32).optional(),
  permissions: z.array(z.string().max(64)).max(200).default([]),
});

export const DraftPositionSchema = z.object({
  name,
  track: z.enum(POSITION_TRACKS).default('INDIVIDUAL_CONTRIBUTOR'),
});

export const DraftOrgUnitTypeSchema = z.object({
  name,
  dimension: shortText.default('Departments'),
});

export const DraftOrgUnitSchema = z.object({
  name,
  type: name,
  code: z.string().max(40).optional(),
  parent: name.optional(),
});

export const DraftKpiCategorySchema = z.object({
  name,
  color: z.string().max(32).optional(),
});

export const DraftKpiSchema = z.object({
  name,
  description: z.string().max(2000).optional(),
  category: name,
  scope: z.enum(KPI_SCOPES).default('ORG_WIDE'),
  type: z.enum(KPI_TYPES).default('NUMBER'),
  direction: z.enum(KPI_DIRECTIONS).default('HIGHER_IS_BETTER'),
  frequency: z.enum(KPI_FREQUENCIES).default('MONTHLY'),
  unit: z.string().max(40).optional(),
  scorecardQuadrant: z.enum(SCORECARD_QUADRANTS).optional(),
});

const list = <T extends z.ZodType>(item: T) => z.array(item).max(DRAFT_SECTION_MAX);

/** Every section the draft can hold. A write may carry any subset; unknown sections are refused. */
export const OnboardingDraftPatchSchema = z
  .object({
    organization: DraftOrganizationSchema,
    roles: list(DraftRoleSchema),
    positions: list(DraftPositionSchema),
    orgUnitTypes: list(DraftOrgUnitTypeSchema),
    orgUnits: list(DraftOrgUnitSchema),
    kpiCategories: list(DraftKpiCategorySchema),
    kpis: list(DraftKpiSchema),
  })
  .partial()
  .strict();

export type OnboardingDraft = z.infer<typeof OnboardingDraftPatchSchema>;
export type DraftRole = z.infer<typeof DraftRoleSchema>;
export type DraftPosition = z.infer<typeof DraftPositionSchema>;
export type DraftOrgUnitType = z.infer<typeof DraftOrgUnitTypeSchema>;
export type DraftOrgUnit = z.infer<typeof DraftOrgUnitSchema>;
export type DraftKpiCategory = z.infer<typeof DraftKpiCategorySchema>;
export type DraftKpi = z.infer<typeof DraftKpiSchema>;

export const DRAFT_SECTIONS = [
  'organization',
  'roles',
  'positions',
  'orgUnitTypes',
  'orgUnits',
  'kpiCategories',
  'kpis',
] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];

/** One thing wrong with a draft, and where: the wizard links it back to the step and row. */
export interface DraftProblem {
  section: DraftSection;
  /** Row within the section (0-based), when the problem is about one row. */
  index?: number;
  /** Field within the row or section. */
  field?: string;
  message: string;
}

const isSection = (value: unknown): value is DraftSection =>
  typeof value === 'string' && (DRAFT_SECTIONS as readonly string[]).includes(value);

/** Turn schema issues into problems that say which section, row and field they are about. */
export function draftShapeProblems(issues: readonly { path: PropertyKey[]; message: string }[]): DraftProblem[] {
  return issues.map((issue) => {
    const [first, second, third] = issue.path;
    const section: DraftSection = isSection(first) ? first : 'organization';
    if (typeof second === 'number') {
      return { section, index: second, ...(typeof third === 'string' ? { field: third } : {}), message: issue.message };
    }
    return { section, ...(typeof second === 'string' ? { field: second } : {}), message: issue.message };
  });
}

const key = (value: string): string => value.trim().toLowerCase();

function namedRows(
  section: DraftSection,
  rows: readonly { name: string }[],
  what: string,
  problems: DraftProblem[],
): Set<string> {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const k = key(row.name);
    if (!k) {
      problems.push({ section, index, field: 'name', message: `Give this ${what} a name.` });
      return;
    }
    if (seen.has(k)) {
      problems.push({ section, index, field: 'name', message: `There is already a ${what} called "${row.name.trim()}".` });
      return;
    }
    seen.add(k);
  });
  return seen;
}

const PERMISSION_KEYS: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/**
 * Everything that stops this draft becoming an organisation. Empty = ready.
 * Takes anything (a draft is a JSON column): a draft that does not even have
 * the right shape reports that, instead of throwing.
 */
export function validateOnboardingDraft(raw: unknown): DraftProblem[] {
  const parsed = OnboardingDraftPatchSchema.safeParse(raw ?? {});
  if (!parsed.success) return draftShapeProblems(parsed.error.issues);

  const draft = parsed.data;
  const problems: DraftProblem[] = [];

  if (!draft.organization?.name?.trim()) {
    problems.push({ section: 'organization', field: 'name', message: 'Give your organization a name.' });
  }

  const roles = draft.roles ?? [];
  namedRows('roles', roles, 'role', problems);
  if (!roles.some((r) => r.isAdmin)) {
    problems.push({
      section: 'roles',
      message: 'At least one role must be an administrator role — otherwise nobody could manage the organization.',
    });
  }
  roles.forEach((role, index) => {
    for (const permission of role.permissions) {
      if (!PERMISSION_KEYS.has(permission)) {
        problems.push({
          section: 'roles',
          index,
          field: 'permissions',
          message: `"${permission}" is not a permission, so it would grant nothing.`,
        });
      }
    }
  });

  namedRows('positions', draft.positions ?? [], 'position', problems);

  const typeNames = namedRows('orgUnitTypes', draft.orgUnitTypes ?? [], 'unit type', problems);

  const units = draft.orgUnits ?? [];
  const unitNames = namedRows('orgUnits', units, 'unit', problems);
  const parentOf = new Map<string, string>();
  units.forEach((unit, index) => {
    const self = key(unit.name);
    if (!typeNames.has(key(unit.type))) {
      problems.push({
        section: 'orgUnits',
        index,
        field: 'type',
        message: unit.type.trim() ? `"${unit.type.trim()}" is not one of the unit types.` : 'Choose what kind of unit this is.',
      });
    }
    const parent = unit.parent ? key(unit.parent) : '';
    if (!parent) return;
    if (parent === self) {
      problems.push({ section: 'orgUnits', index, field: 'parent', message: 'A unit cannot sit under itself.' });
    } else if (!unitNames.has(parent)) {
      problems.push({ section: 'orgUnits', index, field: 'parent', message: `There is no unit called "${unit.parent!.trim()}".` });
    } else if (self) {
      parentOf.set(self, parent);
    }
  });
  // A loop (A under B under A) would never be created: nothing could go first.
  units.forEach((unit, index) => {
    const start = key(unit.name);
    let cursor = parentOf.get(start);
    for (let hops = 0; cursor && hops <= units.length; hops += 1) {
      if (cursor === start) {
        problems.push({ section: 'orgUnits', index, field: 'parent', message: 'These units sit under each other in a loop.' });
        break;
      }
      cursor = parentOf.get(cursor);
    }
  });

  const categoryNames = namedRows('kpiCategories', draft.kpiCategories ?? [], 'KPI category', problems);

  const kpis = draft.kpis ?? [];
  namedRows('kpis', kpis, 'KPI', problems);
  kpis.forEach((kpi, index) => {
    if (!categoryNames.has(key(kpi.category))) {
      problems.push({
        section: 'kpis',
        index,
        field: 'category',
        message: kpi.category.trim() ? `"${kpi.category.trim()}" is not one of the KPI categories.` : 'Choose a category for this KPI.',
      });
    }
  });

  return problems;
}
