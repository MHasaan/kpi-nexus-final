import { describe, expect, test } from 'vitest';

import { categoryUsage, newKpi, renameCategory, setKpiField, setKpiScope, targetFromInput, toggleKpiUnit, topLevelUnitNames } from './wizard-kpis';

const kpi = (name: string, category: string, extra: Record<string, unknown> = {}) => ({ name, category, ...extra });

describe('newKpi', () => {
  test('starts in the first named category, monthly, organisation-wide, higher is better', () => {
    expect(newKpi({ kpiCategories: [{ name: ' ' }, { name: 'Sales' }] })).toEqual({
      name: '',
      category: 'Sales',
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      frequency: 'MONTHLY',
    });
  });

  test('with no categories yet, the category is left to choose', () => {
    expect(newKpi({}).category).toBe('');
  });
});

describe('categories', () => {
  const draft = { kpiCategories: [{ name: 'Delivery' }, { name: 'Money' }], kpis: [kpi('Cycle Time', 'delivery'), kpi('Revenue', 'Money'), kpi('Bugs', 'Delivery')] };

  test('renaming a category moves its KPIs with it', () => {
    const patch = renameCategory(draft, 0, 'Engineering');
    expect(patch.kpiCategories!.map((c) => c.name)).toEqual(['Engineering', 'Money']);
    expect(patch.kpis!.map((k) => k.category)).toEqual(['Engineering', 'Money', 'Engineering']);
  });

  test('a category with no KPIs leaves the KPIs alone', () => {
    expect(Object.keys(renameCategory({ ...draft, kpis: [] }, 0, 'X'))).toEqual(['kpiCategories']);
  });

  test('usage counts its KPIs, however the name is capitalised', () => {
    expect(categoryUsage(draft, 'DELIVERY')).toBe(2);
    expect(categoryUsage(draft, 'Quality')).toBe(0);
  });
});

describe('scope and units', () => {
  test('only a per-unit KPI keeps its units', () => {
    const perUnit = kpi('Cycle Time', 'Delivery', { scope: 'PER_UNIT', units: ['Engineering'] });
    expect(setKpiScope(perUnit, 'ORG_WIDE')).toEqual(kpi('Cycle Time', 'Delivery', { scope: 'ORG_WIDE' }));
    expect(setKpiScope(perUnit, 'PER_UNIT').units).toEqual(['Engineering']);
  });

  test('units are ticked on and off; none left means none named', () => {
    const one = toggleKpiUnit(kpi('Cycle Time', 'Delivery', { scope: 'PER_UNIT' }), 'Engineering');
    expect(one.units).toEqual(['Engineering']);
    const two = toggleKpiUnit(one, 'Sales');
    expect(two.units).toEqual(['Engineering', 'Sales']);
    expect(toggleKpiUnit(two, 'engineering').units).toEqual(['Sales']);
    expect(toggleKpiUnit(one, 'Engineering')).not.toHaveProperty('units');
  });

  test('with none named, the top-level units hold it', () => {
    const draft = { orgUnits: [{ name: 'Engineering', type: 'D' }, { name: 'Platform', type: 'D', parent: 'engineering' }, { name: 'Sales', type: 'D' }, { name: 'Lost', type: 'D', parent: 'Nowhere' }] };
    expect(topLevelUnitNames(draft)).toEqual(['Engineering', 'Sales', 'Lost']);
  });
});

describe('fields', () => {
  test('a target is a number or nothing', () => {
    expect(targetFromInput('5')).toBe(5);
    expect(targetFromInput(' -2.5 ')).toBe(-2.5);
    expect(targetFromInput('0')).toBe(0);
    expect(targetFromInput('')).toBeUndefined();
    expect(targetFromInput('lots')).toBeUndefined();
  });

  test('clearing an optional field removes it rather than storing nothing', () => {
    const withUnit = setKpiField(kpi('Revenue', 'Money'), 'unit', 'USD');
    expect(withUnit.unit).toBe('USD');
    expect(setKpiField(withUnit, 'unit', '')).toEqual(kpi('Revenue', 'Money'));
    expect(setKpiField(kpi('Revenue', 'Money', { targetValue: 0 }), 'targetValue', 0).targetValue).toBe(0);
  });
});
