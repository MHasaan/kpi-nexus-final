/**
 * Unit tests for the pure helpForPath helper.
 * No DOM/React required — runs in vitest node environment.
 */
import { describe, expect, test } from 'vitest';

import { helpForPath, HELP_DEFAULT } from './contextual-help';

describe('helpForPath', () => {
  test('exact route /dashboard returns dashboard entry', () => {
    const entry = helpForPath('/dashboard');
    expect(entry.title).toBe('Dashboard tips');
    expect(entry.tips.length).toBeGreaterThanOrEqual(1);
  });

  test('exact route /kpis returns kpis entry', () => {
    const entry = helpForPath('/kpis');
    expect(entry.title).toBe('KPI tips');
  });

  test('exact route /alerts returns alerts entry', () => {
    const entry = helpForPath('/alerts');
    expect(entry.title).toBe('Alerts tips');
  });

  test('exact route /roles returns roles entry', () => {
    const entry = helpForPath('/roles');
    expect(entry.title).toBe('Roles & permissions tips');
  });

  test('exact route /org-units returns org-units entry', () => {
    const entry = helpForPath('/org-units');
    expect(entry.title).toBe('Teams (org-units) tips');
  });

  test('exact route /settings returns settings entry', () => {
    const entry = helpForPath('/settings');
    expect(entry.title).toBe('Settings tips');
  });

  test('exact route /okrs returns okrs entry', () => {
    const entry = helpForPath('/okrs');
    expect(entry.title).toBe('OKRs tips');
  });

  test('exact route /ask returns AI assistant entry', () => {
    const entry = helpForPath('/ask');
    expect(entry.title).toBe('AI assistant tips');
  });

  test('nested path /kpis/123 matches /kpis via prefix', () => {
    const entry = helpForPath('/kpis/123');
    expect(entry.title).toBe('KPI tips');
  });

  test('nested path /kpis/abc-def/detail matches /kpis via prefix', () => {
    const entry = helpForPath('/kpis/abc-def/detail');
    expect(entry.title).toBe('KPI tips');
  });

  test('nested path /settings/organization matches /settings via prefix', () => {
    const entry = helpForPath('/settings/organization');
    expect(entry.title).toBe('Settings tips');
  });

  test('nested path /org-units/123/members matches /org-units via prefix', () => {
    const entry = helpForPath('/org-units/123/members');
    expect(entry.title).toBe('Teams (org-units) tips');
  });

  test('unknown route /nonexistent returns DEFAULT', () => {
    const entry = helpForPath('/nonexistent');
    expect(entry).toBe(HELP_DEFAULT);
    expect(entry.title).toBe('KPI Nexus Help');
  });

  test('empty string returns DEFAULT', () => {
    const entry = helpForPath('');
    expect(entry).toBe(HELP_DEFAULT);
  });

  test('random deeply nested unknown route returns DEFAULT', () => {
    const entry = helpForPath('/some/deeply/nested/unknown/page');
    expect(entry).toBe(HELP_DEFAULT);
  });

  test('every registered route has at least one tip', () => {
    const routes = [
      '/dashboard',
      '/dashboards',
      '/kpis',
      '/alerts',
      '/roles',
      '/org-units',
      '/users',
      '/settings',
      '/okrs',
      '/ask',
      '/profile',
    ];
    for (const route of routes) {
      const entry = helpForPath(route);
      expect(entry.tips.length, `${route} should have tips`).toBeGreaterThan(0);
    }
  });
});
