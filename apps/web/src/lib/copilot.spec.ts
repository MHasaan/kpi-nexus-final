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
  groupPatchBySection,
  suggestionPatch,
} from './copilot';
import type { DraftPayload } from './onboarding-client';
import type { PatchOp } from './copilot';

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
