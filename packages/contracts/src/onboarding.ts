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

/** How big the organisation is. Stored on Organization.sizeTier. */
export const ORG_SIZE_TIERS = ['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'] as const;
export type OrgSizeTier = (typeof ORG_SIZE_TIERS)[number];

const SIZE_TIER_WORDS: Readonly<Record<string, OrgSizeTier>> = {
  STARTUP: 'SMALL',
  SMB: 'SMALL',
  SMALL_BUSINESS: 'SMALL',
  SCALEUP: 'MEDIUM',
  SCALE_UP: 'MEDIUM',
  MID: 'MEDIUM',
  MIDSIZE: 'MEDIUM',
  MID_MARKET: 'MEDIUM',
  MIDMARKET: 'MEDIUM',
  CORPORATE: 'LARGE',
};

/**
 * The stored size for whatever a template or the AI called it. Templates say
 * "SCALEUP", "STARTUP", "SMB"; none of those is a stored value, so they used to
 * be dropped without a word. Unknown words still give null (no size recorded).
 */
export function normalizeSizeTier(value: string | null | undefined): OrgSizeTier | null {
  const word = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if ((ORG_SIZE_TIERS as readonly string[]).includes(word)) return word as OrgSizeTier;
  return SIZE_TIER_WORDS[word] ?? null;
}

/** The most rows one section may hold. Far above any real organisation; stops a draft being used as storage. */
export const DRAFT_SECTION_MAX = 500;

const name = z.string().max(160);
const shortText = z.string().max(120);

export const DraftOrganizationSchema = z.object({
  name: z.string().max(200).optional(),
  industry: shortText.optional(),
  type: shortText.optional(),
  sizeTier: z.string().max(40).optional(),
  /** IANA zone, e.g. "Asia/Karachi". Checked for real in validateOnboardingDraft. */
  timezone: z.string().max(60).optional(),
  /** ISO 4217 code, e.g. "USD". */
  currency: z.string().max(3).optional(),
  /** BCP 47 tag, e.g. "en-GB". */
  locale: z.string().max(15).optional(),
  /** 1 = January … 12 = December. */
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: z.number().int().min(0).max(6).optional(),
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
  targetValue: z.number().finite().optional(),
  /**
   * For a PER_UNIT KPI: the units that hold it (the units below them inherit
   * it). Left out, every top-level unit holds it.
   */
  units: z.array(name).max(DRAFT_SECTION_MAX).optional(),
});

/**
 * How many people setup may invite. Each is sent an email before the
 * organisation has done anything else, so this is a team, not a mailing list;
 * more are invited from the People page afterwards.
 */
export const DRAFT_TEAM_MAX = 50;

export const DraftTeamMemberSchema = z.object({
  email: z.string().max(254),
  fullName: z.string().max(160),
  /** A role from the draft, by name. */
  role: name.optional(),
  /** A position from the draft, by name. */
  position: name.optional(),
  /** The unit they belong to, by name. */
  unit: name.optional(),
  /** Who they report to: another team member's email, or the administrator's. */
  manager: z.string().max(254).optional(),
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
    team: z.array(DraftTeamMemberSchema).max(DRAFT_TEAM_MAX),
  })
  .partial()
  .strict();

export type OnboardingDraft = z.infer<typeof OnboardingDraftPatchSchema>;
/**
 * A draft as it is written, before defaults are filled in: a role needs only
 * a name, a KPI only a name and a category. This is what the wizard holds.
 */
export type OnboardingDraftInput = z.input<typeof OnboardingDraftPatchSchema>;
export type DraftRole = z.infer<typeof DraftRoleSchema>;
export type DraftPosition = z.infer<typeof DraftPositionSchema>;
export type DraftOrgUnitType = z.infer<typeof DraftOrgUnitTypeSchema>;
export type DraftOrgUnit = z.infer<typeof DraftOrgUnitSchema>;
export type DraftKpiCategory = z.infer<typeof DraftKpiCategorySchema>;
export type DraftKpi = z.infer<typeof DraftKpiSchema>;
export type DraftTeamMember = z.infer<typeof DraftTeamMemberSchema>;

export const DRAFT_SECTIONS = [
  'organization',
  'roles',
  'positions',
  'orgUnitTypes',
  'orgUnits',
  'kpiCategories',
  'kpis',
  'team',
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

// One @, something either side, a dot in the domain. The invitation email is the real test.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether the runtime knows this IANA time zone. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Whether this is a well-formed language tag ("en", "en-GB", "ur-PK"). */
export function isLocaleTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

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
export function validateOnboardingDraft(raw: unknown, options: { adminEmail?: string } = {}): DraftProblem[] {
  const parsed = OnboardingDraftPatchSchema.safeParse(raw ?? {});
  if (!parsed.success) return draftShapeProblems(parsed.error.issues);

  const draft = parsed.data;
  const problems: DraftProblem[] = [];

  if (!draft.organization?.name?.trim()) {
    problems.push({ section: 'organization', field: 'name', message: 'Give your organization a name.' });
  }

  const org = draft.organization ?? {};
  if (org.timezone !== undefined && !isTimeZone(org.timezone)) {
    problems.push({ section: 'organization', field: 'timezone', message: `"${org.timezone}" is not a time zone.` });
  }
  if (org.currency !== undefined && !/^[A-Za-z]{3}$/.test(org.currency)) {
    problems.push({ section: 'organization', field: 'currency', message: 'Choose a currency (a three-letter code such as USD).' });
  }
  if (org.locale !== undefined && !isLocaleTag(org.locale)) {
    problems.push({ section: 'organization', field: 'locale', message: `"${org.locale}" is not a language setting.` });
  }

  const roles = draft.roles ?? [];
  const roleNames = namedRows('roles', roles, 'role', problems);
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

  const positionNames = namedRows('positions', draft.positions ?? [], 'position', problems);

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
    const named = (kpi.units ?? []).filter((u) => u.trim());
    if (kpi.scope !== 'PER_UNIT') {
      if (named.length > 0) {
        problems.push({
          section: 'kpis',
          index,
          field: 'units',
          message: 'Only a KPI recorded per unit is held by units. Change its scope, or remove the units.',
        });
      }
      return;
    }
    if (units.length === 0) {
      problems.push({
        section: 'kpis',
        index,
        field: 'scope',
        message: 'This KPI is recorded per unit, but there are no units yet. Add a unit, or record it for the whole organization.',
      });
      return;
    }
    for (const unit of named) {
      if (!unitNames.has(key(unit))) {
        problems.push({ section: 'kpis', index, field: 'units', message: `There is no unit called "${unit.trim()}".` });
      }
    }
  });

  // --- team: the people invited as part of setup --------------------------
  const team = draft.team ?? [];
  const adminEmail = options.adminEmail ? key(options.adminEmail) : '';
  const emails = new Set<string>();
  const reportsTo = new Map<string, string>();
  team.forEach((person, index) => {
    const at = (field: string, message: string) => problems.push({ section: 'team', index, field, message });
    const email = key(person.email);
    if (!email) at('email', 'Enter their email.');
    else if (!EMAIL.test(email)) at('email', `"${person.email.trim()}" is not an email address.`);
    else if (email === adminEmail) at('email', 'That is your own email — you are already the administrator.');
    else if (emails.has(email)) at('email', `${person.email.trim()} is on the list twice.`);
    else emails.add(email);

    if (person.fullName.trim().length < 2) at('fullName', 'Enter their name.');
    if (person.role?.trim() && !roleNames.has(key(person.role))) at('role', `"${person.role.trim()}" is not one of the roles.`);
    if (person.position?.trim() && !positionNames.has(key(person.position))) {
      at('position', `"${person.position.trim()}" is not one of the positions.`);
    }
    if (person.unit?.trim() && !unitNames.has(key(person.unit))) at('unit', `There is no unit called "${person.unit.trim()}".`);
  });
  team.forEach((person, index) => {
    const manager = person.manager ? key(person.manager) : '';
    if (!manager) return;
    const self = key(person.email);
    if (manager === self) {
      problems.push({ section: 'team', index, field: 'manager', message: 'Nobody reports to themself.' });
    } else if (manager !== adminEmail && !emails.has(manager)) {
      problems.push({
        section: 'team',
        index,
        field: 'manager',
        message: `${person.manager!.trim()} is not on the list. A manager is someone you are inviting, or you.`,
      });
    } else if (self && manager !== adminEmail) {
      reportsTo.set(self, manager);
    }
  });
  team.forEach((person, index) => {
    const start = key(person.email);
    let cursor = reportsTo.get(start);
    for (let hops = 0; cursor && hops <= team.length; hops += 1) {
      if (cursor === start) {
        problems.push({ section: 'team', index, field: 'manager', message: 'These people report to each other in a loop.' });
        break;
      }
      cursor = reportsTo.get(cursor);
    }
  });

  return problems;
}
