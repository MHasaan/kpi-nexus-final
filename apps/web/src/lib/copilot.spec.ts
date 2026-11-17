/**
 * Onboarding AI co-pilot rail logic. The assistant answers with an RFC 6902
 * JSON Patch against the draft; nothing applied it before (the wizard only
 * used generate + apply). These pure helpers apply it safely, group it by
 * draft section for per-section accept / reject, turn a suggestion chip into
 * a draft patch, and phrase the API's limit errors.
 */
import { describe, expect, test } from 'vitest';

import { ApiError } from './api-client';
import {
  acceptedSectionsPatch,
  applyJsonPatch,
  copilotErrorMessage,
  defaultAccepted,
  describeOps,
  groupPatchBySection,
  previewNames,
  renamesOrganization,
  sectionLabel,
  suggestionPatch,
} from './copilot';
import type { DraftPayload } from './onboarding-client';
import type { PatchOp, SectionGroup } from './copilot';

const draft: DraftPayload = {
  organization: { name: 'Acme', industry: 'SaaS' },
  roles: [{ name: 'Admin' }, { name: 'Engineer' }],
  kpiCategories: [{ name: 'Revenue' }],
};

describe('applyJsonPatch', () => {
  test('add / replace / remove, including "-" to append', () => {
    const out = applyJsonPatch(draft, [
      { op: 'add', path: '/roles/-', value: { name: 'Designer' } },
      { op: 'replace', path: '/organization/industry', value: 'Fintech' },
      { op: 'remove', path: '/roles/0' },
      { op: 'add', path: '/kpiCategories/0', value: { name: 'Growth' } },
    ]);
    expect(out.roles).toEqual([{ name: 'Engineer' }, { name: 'Designer' }]);
    expect(out.organization?.industry).toBe('Fintech');
    expect(out.kpiCategories).toEqual([{ name: 'Growth' }, { name: 'Revenue' }]);
  });

  test('never mutates the input draft', () => {
    applyJsonPatch(draft, [{ op: 'remove', path: '/roles/0' }]);
    expect(draft.roles).toHaveLength(2);
  });

  test('decodes ~1 and ~0 in path segments', () => {
    const out = applyJsonPatch({ organization: { name: 'x' } }, [{ op: 'add', path: '/organization/a~1b~0c', value: 1 }]);
    expect((out.organization as Record<string, unknown>)['a/b~c']).toBe(1);
  });

  test('rejects paths outside the draft sections and prototype-polluting keys', () => {
    expect(() => applyJsonPatch(draft, [{ op: 'add', path: '/adminPassword', value: 'x' }])).toThrow();
    expect(() => applyJsonPatch(draft, [{ op: 'add', path: '/organization/__proto__/polluted', value: true }])).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('an add into a section the draft does not have yet creates it (a quick-start draft has no roles)', () => {
    const out = applyJsonPatch({ organization: { name: 'Acme' } }, [
      { op: 'add', path: '/roles/-', value: { name: 'Designer' } },
      { op: 'add', path: '/kpiCategories/0', value: { name: 'Growth' } },
    ]);
    expect(out.roles).toEqual([{ name: 'Designer' }]);
    expect(out.kpiCategories).toEqual([{ name: 'Growth' }]);
    expect(() => applyJsonPatch({}, [{ op: 'remove', path: '/roles/0' }])).toThrow();
  });

  test('rejects an op on a path that does not exist, or an unsupported op', () => {
    expect(() => applyJsonPatch(draft, [{ op: 'replace', path: '/roles/9', value: {} }])).toThrow();
    expect(() => applyJsonPatch(draft, [{ op: 'move', path: '/roles/0', from: '/roles/1' } as unknown as PatchOp])).toThrow();
  });
});

describe('groupPatchBySection', () => {
  test('groups ops by top-level draft section with an add / replace / remove summary', () => {
    const groups = groupPatchBySection([
      { op: 'add', path: '/roles/-', value: { name: 'Designer' } },
      { op: 'add', path: '/roles/-', value: { name: 'PM' } },
      { op: 'replace', path: '/organization/industry', value: 'Fintech' },
      { op: 'remove', path: '/kpiCategories/0' },
    ]);
    expect(groups.sections.map((g) => [g.section, g.summary])).toEqual([
      ['roles', { add: 2, replace: 0, remove: 0 }],
      ['organization', { add: 0, replace: 1, remove: 0 }],
      ['kpiCategories', { add: 0, replace: 0, remove: 1 }],
    ]);
    expect(groups.ignored).toBe(0);
  });

  test('counts ops it cannot use (unknown section, bad shape) as ignored', () => {
    const groups = groupPatchBySection([{ op: 'add', path: '/secret', value: 1 }, 'not an op', { op: 'add' }, { op: 'remove', path: '/roles/0' }]);
    expect(groups.sections.map((g) => g.section)).toEqual(['roles']);
    expect(groups.ignored).toBe(3);
  });
});

describe('acceptedSectionsPatch', () => {
  test('applies only accepted sections and returns each changed section whole (the API replaces per key)', () => {
    const { sections } = groupPatchBySection([
      { op: 'add', path: '/roles/-', value: { name: 'Designer' } },
      { op: 'replace', path: '/organization/industry', value: 'Fintech' },
    ]);
    const patch = acceptedSectionsPatch(draft, sections, new Set(['roles']));
    expect(Object.keys(patch)).toEqual(['roles']);
    expect(patch.roles).toEqual([{ name: 'Admin' }, { name: 'Engineer' }, { name: 'Designer' }]);
  });

  test('nothing accepted → empty patch', () => {
    const { sections } = groupPatchBySection([{ op: 'remove', path: '/roles/0' }]);
    expect(acceptedSectionsPatch(draft, sections, new Set())).toEqual({});
  });
});

describe('suggestionPatch', () => {
  test('an organization field chip sets that field and keeps the rest', () => {
    expect(suggestionPatch(draft, 'organization.industry', 'Fintech')).toEqual({ organization: { name: 'Acme', industry: 'Fintech' } });
  });

  test('a KPI category chip appends a category, once', () => {
    expect(suggestionPatch(draft, 'kpiCategories', 'Growth')).toEqual({ kpiCategories: [{ name: 'Revenue' }, { name: 'Growth' }] });
    expect(suggestionPatch(draft, 'kpiCategories', 'revenue')).toBeNull();
  });

  test('a field chips cannot fill safely → null', () => {
    expect(suggestionPatch(draft, 'roles', 'Designer')).toBeNull();
  });
});

describe('copilotErrorMessage', () => {
  test('rate limit shows the wait in minutes', () => {
    const e = new ApiError(429, 'Too many assistant requests; try again later', 'RATE_LIMITED', { retryAfter: 3600 });
    expect(copilotErrorMessage(e)).toBe('Too many assistant requests; try again in about 60 min.');
  });

  test('AI unavailable and unknown errors get plain messages', () => {
    expect(copilotErrorMessage(new ApiError(503, 'AI providers unavailable', 'AI_UNAVAILABLE'))).toBe('The AI co-pilot is unavailable right now. Try again later.');
    expect(copilotErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});

// ---- Plan 3.8: what a proposal contains, in words --------------------------

describe('sectionLabel', () => {
  test('every draft section has a name a person would use', () => {
    expect(sectionLabel('orgUnits')).toBe('Units');
    expect(sectionLabel('kpiCategories')).toBe('KPI categories');
    expect(sectionLabel('organization')).toBe('Organization details');
    expect(sectionLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('previewNames', () => {
  const preview = {
    organization: { name: 'Acme', industry: 'Software', type: 'B2B SaaS' },
    roles: [{ name: 'Admin' }, { name: 'Engineer' }, { name: '' }],
    kpis: [{ name: 'MRR' }],
  };

  test('lists the rows of a section by name', () => {
    expect(previewNames(preview, 'roles')).toEqual(['Admin', 'Engineer', 'unnamed']);
    expect(previewNames(preview, 'kpis')).toEqual(['MRR']);
  });

  test('the organisation is listed as the details it would fill in — not its name, which is yours', () => {
    expect(previewNames(preview, 'organization')).toEqual(['Industry: Software', 'Type: B2B SaaS']);
  });

  test('a section the proposal does not have is empty, not an error', () => {
    expect(previewNames(preview, 'positions')).toEqual([]);
    expect(previewNames(undefined, 'roles')).toEqual([]);
  });
});

describe('describeOps', () => {
  test('says what each change does', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/roles/-', value: { name: 'Head of Design' } },
      { op: 'replace', path: '/organization/name', value: 'New Name' },
      { op: 'replace', path: '/roles/1/name', value: 'Staff' },
      { op: 'remove', path: '/roles/1' },
    ];
    expect(describeOps(draft, ops)).toEqual(['Add “Head of Design”', 'Change name to “New Name”', 'Change name of “Engineer” to “Staff”', 'Remove “Engineer”']);
  });
});

describe('renamesOrganization', () => {
  test('a change to the name, or to the whole organisation, renames it', () => {
    expect(renamesOrganization([{ op: 'replace', path: '/organization/name', value: 'X' }])).toBe(true);
    expect(renamesOrganization([{ op: 'replace', path: '/organization', value: { name: 'X' } }])).toBe(true);
    expect(renamesOrganization([{ op: 'add', path: '/organization/industry', value: 'Retail' }])).toBe(false);
  });
});

describe('defaultAccepted', () => {
  const group = (section: 'organization' | 'roles', ops: PatchOp[]): SectionGroup => ({ section, ops, summary: { add: 0, replace: 0, remove: 0 } });

  test('everything is accepted by default, except a rename of an organisation that already has a name', () => {
    const groups = [group('roles', [{ op: 'add', path: '/roles/-', value: { name: 'X' } }]), group('organization', [{ op: 'replace', path: '/organization/name', value: 'Other' }])];
    expect([...defaultAccepted(draft, groups)]).toEqual(['roles']);
  });

  test('an organisation change that is not a rename stays accepted', () => {
    const groups = [group('organization', [{ op: 'add', path: '/organization/type', value: 'B2B' }])];
    expect([...defaultAccepted(draft, groups)]).toEqual(['organization']);
  });

  test('with no name yet, a proposed name is accepted', () => {
    const groups = [group('organization', [{ op: 'replace', path: '/organization/name', value: 'Other' }])];
    expect([...defaultAccepted({ organization: { name: ' ' } }, groups)]).toEqual(['organization']);
  });
});
