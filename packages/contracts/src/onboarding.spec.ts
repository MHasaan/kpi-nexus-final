import { describe, expect, test } from 'vitest';

import { OnboardingDraftPatchSchema, validateOnboardingDraft } from './onboarding.js';

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
