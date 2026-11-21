import { describe, expect, test } from 'vitest';

import { DraftTeamMemberSchema, OnboardingDraftPatchSchema, normalizeSizeTier, validateOnboardingDraft } from './onboarding.js';

const ready = () => ({
  organization: { name: 'Acme Inc.' },
  roles: [
    { name: 'Admin', isAdmin: true, level: 1, permissions: [] },
    { name: 'Member', isAdmin: false, level: 3, permissions: ['KPI_VIEW'] },
  ],
  positions: [{ name: 'Engineer', track: 'INDIVIDUAL_CONTRIBUTOR' }],
  orgUnitTypes: [{ name: 'Department', dimension: 'Departments' }],
  orgUnits: [
    { name: 'Engineering', type: 'Department' },
    { name: 'Platform', type: 'Department', parent: 'Engineering' },
  ],
  kpiCategories: [{ name: 'Delivery' }],
  kpis: [{ name: 'Cycle Time', category: 'Delivery', scope: 'PER_UNIT', type: 'DURATION', direction: 'LOWER_IS_BETTER', frequency: 'WEEKLY' }],
});

describe('OnboardingDraftPatchSchema — the shape every write must have', () => {
  test('a write may carry one section, and a half-typed row is fine', () => {
    const r = OnboardingDraftPatchSchema.safeParse({ kpis: [{ name: '', category: '' }] });
    expect(r.success).toBe(true);
  });

  test('missing fields take the defaults the wizard starts a new row with', () => {
    const r = OnboardingDraftPatchSchema.parse({ roles: [{ name: 'Analyst' }], kpis: [{ name: 'NPS', category: 'CX' }] });
    expect(r.roles![0]).toEqual({ name: 'Analyst', isAdmin: false, level: 1, permissions: [] });
    expect(r.kpis![0]).toMatchObject({ scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY' });
  });

  test.each([
    ['a section that is not a list', { roles: 'everyone' }],
    ['a row that is not an object', { kpis: ['Revenue'] }],
    ['an enum value that does not exist', { kpis: [{ name: 'X', category: 'Y', scope: 'PER_PLANET' }] }],
    ['a section the draft does not have', { secrets: { apiKey: 'x' } }],
    ['a list longer than any organisation', { positions: Array.from({ length: 501 }, (_, i) => ({ name: `P${i}` })) }],
    ['a name longer than a name', { orgUnits: [{ name: 'x'.repeat(161), type: 'T' }] }],
  ])('refuses %s', (_label, patch) => {
    expect(OnboardingDraftPatchSchema.safeParse(patch).success).toBe(false);
  });

  test('keys a row does not have are dropped, not stored', () => {
    const r = OnboardingDraftPatchSchema.parse({ roles: [{ name: 'Admin', isAdmin: true, payload: '<script>' }] });
    expect(r.roles![0]).not.toHaveProperty('payload');
  });
});

describe('validateOnboardingDraft — can this become an organisation?', () => {
  test('a complete draft has no problems', () => {
    expect(validateOnboardingDraft(ready())).toEqual([]);
  });

  test('an empty draft needs a name and an administrator role', () => {
    expect(validateOnboardingDraft({})).toEqual([
      { section: 'organization', field: 'name', message: 'Give your organization a name.' },
      expect.objectContaining({ section: 'roles', message: expect.stringContaining('administrator role') }),
    ]);
  });

  test('nothing at all (a null column) is reported, not thrown', () => {
    expect(validateOnboardingDraft(null).length).toBeGreaterThan(0);
    expect(validateOnboardingDraft('garbage').length).toBeGreaterThan(0);
  });

  test('a wrong shape says which section, row and field', () => {
    const problems = validateOnboardingDraft({ ...ready(), kpis: [ready().kpis[0], { name: 'Bad', category: 'Delivery', scope: 'NOPE' }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ section: 'kpis', index: 1, field: 'scope' });
  });

  test('an unnamed row and a duplicate name are each pinned to their row', () => {
    const draft = ready();
    draft.roles.push({ name: '  ', isAdmin: false, level: 2, permissions: [] }, { name: 'admin', isAdmin: false, level: 2, permissions: [] });
    expect(validateOnboardingDraft(draft)).toEqual([
      { section: 'roles', index: 2, field: 'name', message: 'Give this role a name.' },
      { section: 'roles', index: 3, field: 'name', message: 'There is already a role called "admin".' },
    ]);
  });

  test('a permission that does not exist is called out on its role', () => {
    const draft = ready();
    draft.roles[1]!.permissions = ['KPI_VIEW', 'KPI_TELEPORT'];
    expect(validateOnboardingDraft(draft)).toEqual([
      expect.objectContaining({ section: 'roles', index: 1, field: 'permissions', message: expect.stringContaining('KPI_TELEPORT') }),
    ]);
  });

  test('a unit must have a known type and a parent that exists', () => {
    const draft = ready();
    draft.orgUnits.push({ name: 'Sales', type: 'Squad' }, { name: 'Support', type: 'Department', parent: 'Nowhere' });
    expect(validateOnboardingDraft(draft)).toEqual([
      { section: 'orgUnits', index: 2, field: 'type', message: '"Squad" is not one of the unit types.' },
      { section: 'orgUnits', index: 3, field: 'parent', message: 'There is no unit called "Nowhere".' },
    ]);
  });

  test('a unit cannot sit under itself, and units cannot sit under each other in a loop', () => {
    const self = ready();
    self.orgUnits[0] = { name: 'Engineering', type: 'Department', parent: 'Engineering' };
    expect(validateOnboardingDraft(self)).toContainEqual({
      section: 'orgUnits',
      index: 0,
      field: 'parent',
      message: 'A unit cannot sit under itself.',
    });

    const loop = ready();
    loop.orgUnits[0] = { name: 'Engineering', type: 'Department', parent: 'Platform' };
    const problems = validateOnboardingDraft(loop);
    expect(problems.filter((p) => p.message.includes('loop')).map((p) => p.index)).toEqual([0, 1]);
  });

  test('a KPI must be in a category that exists', () => {
    const draft = ready();
    draft.kpis.push({ ...draft.kpis[0]!, name: 'NPS', category: 'Customers' }, { ...draft.kpis[0]!, name: 'CSAT', category: '' });
    expect(validateOnboardingDraft(draft)).toEqual([
      { section: 'kpis', index: 1, field: 'category', message: '"Customers" is not one of the KPI categories.' },
      { section: 'kpis', index: 2, field: 'category', message: 'Choose a category for this KPI.' },
    ]);
  });

  test('names are compared without regard to case or surrounding spaces', () => {
    const draft = ready();
    draft.orgUnits[1] = { name: 'Platform', type: ' department ', parent: 'ENGINEERING' };
    draft.kpis[0]!.category = 'delivery';
    expect(validateOnboardingDraft(draft)).toEqual([]);
  });
});

describe('organisation settings in the draft (plan 3.2a)', () => {
  test('timezone, currency, language, fiscal-year start and week start are part of the draft', () => {
    const organization = { name: 'Acme', timezone: 'Asia/Karachi', currency: 'PKR', locale: 'en-GB', fiscalYearStartMonth: 7, weekStartsOn: 1 };
    expect(OnboardingDraftPatchSchema.parse({ organization }).organization).toEqual(organization);
    expect(validateOnboardingDraft({ ...ready(), organization })).toEqual([]);
  });

  test.each([
    ['a month that does not exist', { fiscalYearStartMonth: 13 }],
    ['a month given as text', { fiscalYearStartMonth: 'July' }],
    ['an eighth day of the week', { weekStartsOn: 7 }],
    ['a currency longer than a code', { currency: 'DOLLARS' }],
  ])('the shape refuses %s', (_label, extra) => {
    expect(OnboardingDraftPatchSchema.safeParse({ organization: { name: 'Acme', ...extra } }).success).toBe(false);
  });

  test('a time zone, currency or language that is not one is a problem on its field', () => {
    const draft = { ...ready(), organization: { name: 'Acme', timezone: 'Mars/Olympus', currency: 'U$', locale: 'not a locale' } };
    expect(validateOnboardingDraft(draft).map((p) => [p.section, p.field])).toEqual([
      ['organization', 'timezone'],
      ['organization', 'currency'],
      ['organization', 'locale'],
    ]);
  });
});

describe('normalizeSizeTier', () => {
  test('a stored value is kept, whatever its case', () => {
    expect(normalizeSizeTier('MEDIUM')).toBe('MEDIUM');
    expect(normalizeSizeTier(' enterprise ')).toBe('ENTERPRISE');
  });

  test('what templates and the AI call a size maps to a stored one instead of being dropped', () => {
    expect(normalizeSizeTier('STARTUP')).toBe('SMALL');
    expect(normalizeSizeTier('SMB')).toBe('SMALL');
    expect(normalizeSizeTier('SCALEUP')).toBe('MEDIUM');
    expect(normalizeSizeTier('Mid-market')).toBe('MEDIUM');
    expect(normalizeSizeTier('corporate')).toBe('LARGE');
  });

  test('nothing, or a word that means nothing, records no size', () => {
    expect(normalizeSizeTier(undefined)).toBeNull();
    expect(normalizeSizeTier('')).toBeNull();
    expect(normalizeSizeTier('gigantic')).toBeNull();
  });
});

describe('KPIs in the draft: units, target (plan 3.2b)', () => {
  const perUnit = (extra: Record<string, unknown> = {}) => ({
    name: 'Cycle Time',
    category: 'Delivery',
    scope: 'PER_UNIT',
    type: 'DURATION',
    direction: 'LOWER_IS_BETTER',
    frequency: 'WEEKLY',
    ...extra,
  });

  test('a per-unit KPI can name the units that hold it, and any KPI can carry a target', () => {
    const draft = { ...ready(), kpis: [perUnit({ units: ['Engineering'], targetValue: 5 })] };
    expect(OnboardingDraftPatchSchema.parse(draft).kpis![0]).toMatchObject({ units: ['Engineering'], targetValue: 5 });
    expect(validateOnboardingDraft(draft)).toEqual([]);
  });

  test('a per-unit KPI with no units named is fine: it goes to the top-level units', () => {
    expect(validateOnboardingDraft({ ...ready(), kpis: [perUnit()] })).toEqual([]);
  });

  test('a unit that does not exist is a problem on the KPI', () => {
    const problems = validateOnboardingDraft({ ...ready(), kpis: [perUnit({ units: ['Engineering', 'Marketing'] })] });
    expect(problems).toEqual([{ section: 'kpis', index: 0, field: 'units', message: 'There is no unit called "Marketing".' }]);
  });

  test('only a per-unit KPI is held by units', () => {
    const problems = validateOnboardingDraft({ ...ready(), kpis: [perUnit({ scope: 'ORG_WIDE', units: ['Engineering'] })] });
    expect(problems).toEqual([expect.objectContaining({ section: 'kpis', index: 0, field: 'units' })]);
  });

  test('a per-unit KPI in an organisation with no units could never be recorded', () => {
    const problems = validateOnboardingDraft({ ...ready(), orgUnits: [], kpis: [perUnit()] });
    expect(problems).toEqual([expect.objectContaining({ section: 'kpis', index: 0, field: 'scope' })]);
  });

  test('a target must be a number', () => {
    expect(OnboardingDraftPatchSchema.safeParse({ kpis: [perUnit({ targetValue: 'high' })] }).success).toBe(false);
    expect(OnboardingDraftPatchSchema.safeParse({ kpis: [perUnit({ targetValue: Number.POSITIVE_INFINITY })] }).success).toBe(false);
  });
});

describe('the team in the draft (plan 3.2c)', () => {
  const withTeam = (team: unknown[]) => ({ ...ready(), team });
  const lead = { email: 'lead@acme.test', fullName: 'Lena Lead', role: 'Member', position: 'Engineer', unit: 'Engineering' };

  test('people can be invited with a role, position, unit and manager', () => {
    const draft = withTeam([lead, { email: 'dev@acme.test', fullName: 'Dev Person', manager: 'LEAD@acme.test' }]);
    expect(OnboardingDraftPatchSchema.safeParse(draft).success).toBe(true);
    expect(validateOnboardingDraft(draft)).toEqual([]);
  });

  test('a half-typed row saves, but cannot be completed', () => {
    const draft = withTeam([{ email: '', fullName: '' }]);
    expect(OnboardingDraftPatchSchema.safeParse(draft).success).toBe(true);
    expect(validateOnboardingDraft(draft).map((p) => [p.section, p.index, p.field])).toEqual([
      ['team', 0, 'email'],
      ['team', 0, 'fullName'],
    ]);
  });

  test('an address must be an address, and appear once', () => {
    const problems = validateOnboardingDraft(withTeam([lead, { email: 'not-an-email', fullName: 'Bad Mail' }, { ...lead, email: 'Lead@Acme.test' }]));
    expect(problems.map((p) => [p.index, p.field])).toEqual([[1, 'email'], [2, 'email']]);
    expect(problems[1]!.message).toContain('twice');
  });

  test('a role, position, unit or manager that does not exist is a problem on its field', () => {
    const problems = validateOnboardingDraft(
      withTeam([{ email: 'x@acme.test', fullName: 'Ex Ample', role: 'Wizard', position: 'Seer', unit: 'Tower', manager: 'nobody@acme.test' }]),
    );
    expect(problems.map((p) => p.field)).toEqual(['role', 'position', 'unit', 'manager']);
  });

  test('nobody reports to themself, or in a loop', () => {
    expect(validateOnboardingDraft(withTeam([{ ...lead, manager: lead.email }]))).toEqual([
      expect.objectContaining({ section: 'team', index: 0, field: 'manager' }),
    ]);
    const loop = withTeam([
      { email: 'a@acme.test', fullName: 'Aa Aa', manager: 'b@acme.test' },
      { email: 'b@acme.test', fullName: 'Bb Bb', manager: 'a@acme.test' },
    ]);
    expect(validateOnboardingDraft(loop).filter((p) => p.message.includes('loop')).map((p) => p.index)).toEqual([0, 1]);
  });

  test('the administrator can be named as a manager, but is not invited to their own organisation', () => {
    const adminEmail = 'boss@acme.test';
    expect(validateOnboardingDraft(withTeam([{ ...lead, manager: 'Boss@acme.test' }]), { adminEmail })).toEqual([]);
    expect(validateOnboardingDraft(withTeam([{ ...lead, email: adminEmail }]), { adminEmail })).toEqual([
      expect.objectContaining({ section: 'team', index: 0, field: 'email' }),
    ]);
  });

  test('setup invites a team, not a mailing list', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ email: `p${i}@acme.test`, fullName: `Person ${i}` }));
    expect(OnboardingDraftPatchSchema.safeParse(withTeam(many)).success).toBe(false);
  });
});

// Manual QA (2026-11-19, F-005): the wizard's people step had no unit role, so everyone joined their unit as a
// plain member, unit heads included, and a new organisation had no unit managers until the administrator
// removed and re-added each one.
describe('a team member\'s unit role', () => {
  test('is one of member, lead, manager or deputy, and optional', () => {
    expect(DraftTeamMemberSchema.safeParse({ email: 'cfo@acme.test', fullName: 'Priya Shah', unit: 'Finance', unitRole: 'MANAGER' }).success).toBe(true);
    expect(DraftTeamMemberSchema.safeParse({ email: 'dev@acme.test', fullName: 'Dev Person', unit: 'Engineering' }).success).toBe(true);
    expect(DraftTeamMemberSchema.safeParse({ email: 'x@acme.test', fullName: 'Ex Ample', unit: 'Finance', unitRole: 'BOSS' }).success).toBe(false);
  });
});
