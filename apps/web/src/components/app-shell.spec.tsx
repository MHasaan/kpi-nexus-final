/**
 * Unit tests for the AppShell nav-filtering logic.
 *
 * The web vitest config runs in environment: 'node' (no jsdom), so we test the
 * pure `visibleNavItems` / `filterNav` functions directly rather than rendering
 * the component. That keeps the filtering logic — the security-relevant part —
 * deterministically covered.
 */
import { describe, expect, test } from 'vitest';

import { NAV_ITEMS, filterNav, visibleNavItems } from './app-shell';

// The 18 canonical permission keys an admin holds.
const ADMIN_PERMISSIONS = [
  'KPI_VIEW',
  'KPI_CREATE',
  'KPI_EDIT',
  'KPI_DELETE',
  'KPI_DATA_ENTRY',
  'DASHBOARD_VIEW',
  'DASHBOARD_MANAGE',
  'USERS_VIEW',
  'USERS_MANAGE',
  'ROLES_MANAGE',
  'POSITIONS_MANAGE',
  'GROUPS_VIEW',
  'GROUPS_MANAGE',
  'ALERTS_VIEW',
  'REPORTS_VIEW',
  'ANALYTICS_VIEW',
  'INSIGHTS_VIEW',
  'ORG_SETTINGS',
];

function hrefs(items: { href: string }[]): string[] {
  return items.map((i) => i.href);
}

describe('NAV_ITEMS config', () => {
  test('includes the nine primary nav targets in order', () => {
    expect(hrefs(NAV_ITEMS)).toEqual([
      '/dashboard',
      '/dashboards',
      '/kpis',
      '/users',
      '/org-units',
      '/roles',
      '/alerts',
      '/profile',
      '/settings/organization',
    ]);
  });

  test('Dashboard and Profile have no required permission', () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === '/dashboard');
    const profile = NAV_ITEMS.find((i) => i.href === '/profile');
    expect(dashboard?.permission).toBeUndefined();
    expect(profile?.permission).toBeUndefined();
  });
});

describe('visibleNavItems', () => {
  test('admin sees every nav item', () => {
    expect(hrefs(visibleNavItems(ADMIN_PERMISSIONS))).toEqual(hrefs(NAV_ITEMS));
  });

  test('a viewer lacking ROLES_MANAGE/ORG_SETTINGS/USERS_VIEW/GROUPS_VIEW hides those gated entries', () => {
    // Typical low-privilege "Employee/Viewer": can see KPIs, dashboards, alerts.
    const viewer = ['KPI_VIEW', 'DASHBOARD_VIEW', 'ALERTS_VIEW'];
    const visible = hrefs(visibleNavItems(viewer));

    // Always-visible (no permission) entries present.
    expect(visible).toContain('/dashboard');
    expect(visible).toContain('/profile');
    // Broadly-viewable gated entries the viewer DOES hold.
    expect(visible).toContain('/dashboards');
    expect(visible).toContain('/kpis');
    expect(visible).toContain('/alerts');
    // Admin-only entries are excluded.
    expect(visible).not.toContain('/roles');
    expect(visible).not.toContain('/settings/organization');
    expect(visible).not.toContain('/users');
    expect(visible).not.toContain('/org-units');
  });

  test('empty permission set still shows the no-permission items', () => {
    const visible = hrefs(visibleNavItems([]));
    expect(visible).toEqual(['/dashboard', '/profile']);
  });
});

describe('filterNav (ready gating)', () => {
  test('while not ready, shows only the no-permission items (avoids empty-nav flash)', () => {
    const visible = hrefs(filterNav(NAV_ITEMS, [], false));
    expect(visible).toEqual(['/dashboard', '/profile']);
  });

  test('while not ready, gated items stay hidden even if cache happens to have them', () => {
    // Defensive: until ready, we do not reveal gated items based on a partial cache.
    const visible = hrefs(filterNav(NAV_ITEMS, ['ROLES_MANAGE'], false));
    expect(visible).not.toContain('/roles');
    expect(visible).toEqual(['/dashboard', '/profile']);
  });

  test('once ready, gated items appear for held permissions', () => {
    const visible = hrefs(filterNav(NAV_ITEMS, ['ROLES_MANAGE'], true));
    expect(visible).toContain('/roles');
  });

  test('once ready with admin perms, every item appears', () => {
    expect(hrefs(filterNav(NAV_ITEMS, ADMIN_PERMISSIONS, true))).toEqual(
      hrefs(NAV_ITEMS),
    );
  });
});
