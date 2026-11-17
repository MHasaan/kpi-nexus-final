import { describe, expect, test } from 'vitest';

import { parentChoices, removeUnit, renameUnit, renameUnitType, unitTreeRows, unitTypeUsage } from './wizard-structure';

const unit = (name: string, parent?: string, type = 'Department') => ({ name, type, ...(parent ? { parent } : {}) });
const shape = (units: ReturnType<typeof unit>[]) => unitTreeRows(units).map((r) => `${'  '.repeat(r.depth)}${r.unit.name}`);

describe('unitTreeRows', () => {
  test('each unit sits directly under its parent, whatever order they were added in', () => {
    const units = [unit('Platform', 'Engineering'), unit('Sales'), unit('Engineering'), unit('SRE', 'platform')];
    expect(shape(units)).toEqual(['Sales', 'Engineering', '  Platform', '    SRE']);
  });

  test('rows keep the index they have in the draft, so an edit hits the right one', () => {
    const rows = unitTreeRows([unit('Platform', 'Engineering'), unit('Engineering')]);
    expect(rows.map((r) => [r.unit.name, r.index])).toEqual([['Engineering', 1], ['Platform', 0]]);
  });

  test('a unit with a parent that does not exist, or in a loop, is still shown', () => {
    expect(shape([unit('Orphan', 'Nowhere')])).toEqual(['Orphan']);
    expect(shape([unit('A', 'B'), unit('B', 'A')]).sort()).toEqual(['A', 'B']);
    expect(shape([unit('Self', 'Self')])).toEqual(['Self']);
  });

  test('a half-typed row with no name yet is listed', () => {
    expect(shape([unit('Engineering'), unit('')])).toEqual(['Engineering', '']);
  });
});

describe('parentChoices', () => {
  const units = [unit('Engineering'), unit('Platform', 'Engineering'), unit('SRE', 'Platform'), unit('Sales'), unit('')];

  test('a unit cannot go under itself or anything below it', () => {
    expect(parentChoices(units, 0)).toEqual(['Sales']);
    expect(parentChoices(units, 1)).toEqual(['Engineering', 'Sales']);
  });

  test('a leaf can go under anything named', () => {
    expect(parentChoices(units, 2)).toEqual(['Engineering', 'Platform', 'Sales']);
  });

  test('a new, unnamed unit can go under any named unit', () => {
    expect(parentChoices(units, 4)).toEqual(['Engineering', 'Platform', 'SRE', 'Sales']);
  });
});

describe('renameUnit', () => {
  const draft = {
    orgUnits: [unit('Engineering'), unit('Platform', 'engineering'), unit('Sales')],
    kpis: [{ name: 'Cycle Time', category: 'Delivery', units: ['Engineering', 'Sales'] }, { name: 'Revenue', category: 'Money' }],
    team: [{ email: 'a@x.test', fullName: 'A A', unit: 'ENGINEERING' }, { email: 'b@x.test', fullName: 'B B', unit: 'Sales' }],
  };

  test('the units under it, the KPIs it holds and the people in it follow the new name', () => {
    const patch = renameUnit(draft, 0, 'Eng');
    expect(patch.orgUnits).toEqual([unit('Eng'), unit('Platform', 'Eng'), unit('Sales')]);
    expect(patch.kpis![0]!.units).toEqual(['Eng', 'Sales']);
    expect(patch.team!.map((p) => p.unit)).toEqual(['Eng', 'Sales']);
  });

  test('sections that never mentioned it are left alone (and so not re-saved)', () => {
    expect(Object.keys(renameUnit(draft, 1, 'Core'))).toEqual(['orgUnits']);
  });

  test('naming a new, blank unit touches nothing else', () => {
    const withBlank = { ...draft, orgUnits: [...draft.orgUnits, unit('')] };
    const patch = renameUnit(withBlank, 3, 'Support');
    expect(Object.keys(patch)).toEqual(['orgUnits']);
    expect(patch.orgUnits![1]).toEqual(unit('Platform', 'engineering'));
  });
});

describe('removeUnit', () => {
  test('the units under it move up to its parent; they are not deleted with it', () => {
    const draft = { orgUnits: [unit('Company'), unit('Engineering', 'Company'), unit('Platform', 'Engineering'), unit('SRE', 'Platform')] };
    expect(removeUnit(draft, 1).orgUnits).toEqual([unit('Company'), unit('Platform', 'Company'), unit('SRE', 'Platform')]);
  });

  test('under a top-level unit, they become top-level', () => {
    const draft = { orgUnits: [unit('Engineering'), unit('Platform', 'Engineering')] };
    expect(removeUnit(draft, 0).orgUnits).toEqual([unit('Platform')]);
  });

  test('KPIs stop being held by it and people are left in no unit', () => {
    const draft = {
      orgUnits: [unit('Engineering'), unit('Sales')],
      kpis: [{ name: 'Cycle Time', category: 'Delivery', units: ['Engineering', 'Sales'] }],
      team: [{ email: 'a@x.test', fullName: 'A A', unit: 'Engineering' }],
    };
    const patch = removeUnit(draft, 0);
    expect(patch.kpis![0]!.units).toEqual(['Sales']);
    expect(patch.team![0]).toEqual({ email: 'a@x.test', fullName: 'A A' });
  });
});

describe('unit types', () => {
  const draft = { orgUnitTypes: [{ name: 'Department' }, { name: 'Squad' }], orgUnits: [unit('Engineering'), unit('Sales'), unit('Core', undefined, 'squad')] };

  test('renaming a type renames it on its units', () => {
    const patch = renameUnitType(draft, 0, 'Division');
    expect(patch.orgUnitTypes!.map((t) => t.name)).toEqual(['Division', 'Squad']);
    expect(patch.orgUnits!.map((u) => u.type)).toEqual(['Division', 'Division', 'squad']);
  });

  test('usage counts the units of a type, however it is capitalised', () => {
    expect(unitTypeUsage(draft, 'department')).toBe(2);
    expect(unitTypeUsage(draft, 'Squad')).toBe(1);
    expect(unitTypeUsage(draft, 'Region')).toBe(0);
    expect(unitTypeUsage(draft, '')).toBe(0);
  });
});
