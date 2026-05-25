import { describe, expect, test } from 'vitest';

import { pluralize } from './terminology-context';

describe('pluralize', () => {
  test('appends s for the common case', () => {
    expect(pluralize('Role')).toBe('Roles');
    expect(pluralize('Team')).toBe('Teams');
    expect(pluralize('Member')).toBe('Members');
    expect(pluralize('KPI')).toBe('KPIs');
    expect(pluralize('Dashboard')).toBe('Dashboards');
  });

  test('y → ies when preceded by a consonant', () => {
    expect(pluralize('Category')).toBe('Categories');
    expect(pluralize('Policy')).toBe('Policies');
    expect(pluralize('Story')).toBe('Stories');
  });

  test('vowel + y → just s (Boys, Days, Keys)', () => {
    expect(pluralize('Boy')).toBe('Boys');
    expect(pluralize('Day')).toBe('Days');
    expect(pluralize('Key')).toBe('Keys');
  });

  test('s / x / z / ch / sh → es', () => {
    expect(pluralize('Class')).toBe('Classes');
    expect(pluralize('Box')).toBe('Boxes');
    expect(pluralize('Quiz')).toBe('Quizes');
    expect(pluralize('Pitch')).toBe('Pitches');
    expect(pluralize('Brush')).toBe('Brushes');
  });

  test('empty string is a no-op', () => {
    expect(pluralize('')).toBe('');
  });

  test('preserves casing of the input', () => {
    expect(pluralize('Permission Tier')).toBe('Permission Tiers');
    expect(pluralize('squad')).toBe('squads');
  });
});
