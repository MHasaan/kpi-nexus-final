import { describe, expect, test } from 'vitest';

import { DEFAULT_TERMINOLOGY } from './api-client';
import { navLabelFor } from './nav-terminology';

describe('navLabelFor (FE-007)', () => {
  test('default terminology keeps every nav label as-is', () => {
    for (const [href, label] of [
      ['/kpis', 'KPIs'],
      ['/dashboards', 'Dashboards'],
      ['/roles', 'Roles'],
      ['/tasks', 'Tasks'],
      ['/org-units', 'Teams'],
      ['/users', 'People'],
    ]) {
      expect(navLabelFor(href!, label!, DEFAULT_TERMINOLOGY)).toBe(label);
    }
  });

  test('a customised term replaces the nav label, pluralised', () => {
    const t = { ...DEFAULT_TERMINOLOGY, roleLabel: 'Permission Tier', groupLabel: 'Department' };
    expect(navLabelFor('/roles', 'Roles', t)).toBe('Permission Tiers');
    expect(navLabelFor('/org-units', 'Teams', t)).toBe('Departments');
    expect(navLabelFor('/kpis', 'KPIs', t)).toBe('KPIs');
  });

  test('an explicit plural override wins over the heuristic', () => {
    const t = { ...DEFAULT_TERMINOLOGY, kpiLabel: 'Metric', kpiLabelPlural: 'Measures' };
    expect(navLabelFor('/kpis', 'KPIs', t)).toBe('Measures');
  });

  test('People follows the organisation’s word for a member, once it has one of its own', () => {
    expect(navLabelFor('/users', 'People', DEFAULT_TERMINOLOGY)).toBe('People');
    expect(navLabelFor('/users', 'People', { ...DEFAULT_TERMINOLOGY, memberLabel: 'Employee' })).toBe('Employees');
  });

  test('routes without a term are untouched', () => {
    const t = { ...DEFAULT_TERMINOLOGY, roleLabel: 'Tier' };
    expect(navLabelFor('/settings', 'Settings', t)).toBe('Settings');
  });
});
