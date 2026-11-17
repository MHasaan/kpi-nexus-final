import { describe, expect, test } from 'vitest';

import { WIZARD_STEPS, draftCounts, problemsByStep, slugFromName, stepFromParam, stepNeighbours, stepOfSection } from './wizard-steps';

describe('wizard steps', () => {
  test('six steps, organisation first and review last', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['organization', 'structure', 'roles', 'kpis', 'team', 'review']);
  });

  test('?step= picks a step; anything else is the first', () => {
    expect(stepFromParam('kpis')).toBe('kpis');
    expect(stepFromParam(null)).toBe('organization');
    expect(stepFromParam('')).toBe('organization');
    expect(stepFromParam('../../admin')).toBe('organization');
  });

  test('Back and Continue stop at the ends', () => {
    expect(stepNeighbours('organization')).toEqual({ prev: null, next: 'structure' });
    expect(stepNeighbours('team')).toEqual({ prev: 'kpis', next: 'review' });
    expect(stepNeighbours('review')).toEqual({ prev: 'team', next: null });
  });

  test('every draft section belongs to exactly one step', () => {
    const owned = WIZARD_STEPS.flatMap((s) => [...s.sections]);
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.sort()).toEqual(['kpiCategories', 'kpis', 'orgUnitTypes', 'orgUnits', 'organization', 'positions', 'roles', 'team']);
  });

  test('a problem is traced to the step that fixes it', () => {
    expect(stepOfSection('orgUnitTypes')).toBe('structure');
    expect(stepOfSection('positions')).toBe('roles');
    const grouped = problemsByStep([
      { section: 'kpis', index: 0, field: 'category', message: 'x' },
      { section: 'roles', message: 'y' },
      { section: 'kpiCategories', index: 1, field: 'name', message: 'z' },
    ]);
    expect(grouped.kpis).toHaveLength(2);
    expect(grouped.roles).toHaveLength(1);
    expect(grouped.review).toEqual([]);
    expect(Object.keys(grouped)).toHaveLength(6);
  });

  test('counts read an empty or missing draft as zeros', () => {
    expect(draftCounts(null)).toEqual({ roles: 0, positions: 0, orgUnits: 0, kpiCategories: 0, kpis: 0, team: 0 });
    expect(draftCounts({ roles: [{ name: 'A', isAdmin: true, level: 1, permissions: [] }] }).roles).toBe(1);
  });

  test('an address is made from the name', () => {
    expect(slugFromName('Acme Inc.')).toBe('acme-inc');
    expect(slugFromName('  Über & Söhne  ')).toBe('ber-s-hne');
    expect(slugFromName('---')).toBe('');
  });
});
