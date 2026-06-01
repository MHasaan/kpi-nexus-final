/**
 * Unit tests for the AppShell nav-filtering logic.
 *
 * The web vitest config runs in environment: 'node' (no jsdom), so we test the
 * pure `visibleNavItems` / `filterNav` / `filterNavGroups` functions directly
 * rather than rendering the component. That keeps the filtering logic — the
 * security-relevant part — deterministically covered after the sidebar
 * redesign (flat top-header → grouped sidebar).
 */
import { describe, expect, test } from 'vitest';

import {
  NAV_GROUPS,
  NAV_ITEMS,
  filterNav,
  filterNavGroups,
  navTestId,
  visibleNavItems,
} from './app-shell';

// The 25 canonical permission keys an admin holds (18 base + ADR-001's 7 carved
// capabilities). The nav now gates Integrations→INTEGRATIONS_MANAGE and
// Audit→AUDIT_VIEW, so those must be present for "admin sees every item".
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
  // ADR-001 carved capabilities
  'KPI_IMPORT',
  'REPORTS_MANAGE',
  'ANALYTICS_FORECAST',
  'EXPORTS',
  'AUDIT_VIEW',
  'INTEGRATIONS_MANAGE',
  'BILLING_MANAGE',
];

function hrefs(items: { href: string }[]): string[] {
  return items.map((i) => i.href);
}

// Items that have no required permission and are therefore always visible.
const PUBLIC_HREFS = ['/dashboard', '/okrs', '/tasks', '/approvals', '/activity'];

describe('NAV config', () => {
  test('groups are the four design sections plus the top Workspace entry', () => {
    expect(NAV_GROUPS.map((g) => g.group)).toEqual([
      'Workspace',
      'Measure',
      'Intelligence',
      'Execute',
      'Organize',
    ]);
  });

  test('NAV_ITEMS is the flattened set of every group item', () => {
    expect(NAV_ITEMS).toEqual(NAV_GROUPS.flatMap((g) => g.items));
  });

  test('every MUST-KEEP testid resolves to a leaf with the right route', () => {
    // Mirror the component's resolution: an explicit testId override wins over
    // the href-derived slug (Audit keeps nav-audit despite its /settings/audit route).
    const byTestId = new Map(NAV_ITEMS.map((i) => [i.testId ?? navTestId(i.href), i.href]));
    expect(byTestId.get('nav-dashboard')).toBe('/dashboard');
    expect(byTestId.get('nav-kpis')).toBe('/kpis');
    expect(byTestId.get('nav-reports')).toBe('/reports');
    expect(byTestId.get('nav-roles')).toBe('/roles');
    expect(byTestId.get('nav-positions')).toBe('/positions');
    expect(byTestId.get('nav-audit')).toBe('/settings/audit');
    expect(byTestId.get('nav-settings')).toBe('/settings');
  });

  test('navTestId derives the slug from the href', () => {
    expect(navTestId('/org-units')).toBe('nav-org-units');
    expect(navTestId('/dashboard')).toBe('nav-dashboard');
  });

  test('Dashboard has no required permission', () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === '/dashboard');
    expect(dashboard?.permission).toBeUndefined();
  });
});

describe('visibleNavItems', () => {
  test('admin sees every nav item', () => {
    expect(hrefs(visibleNavItems(ADMIN_PERMISSIONS))).toEqual(hrefs(NAV_ITEMS));
  });

  test('a low-privilege viewer hides gated admin entries but keeps allowed ones', () => {
    const viewer = ['KPI_VIEW', 'DASHBOARD_VIEW', 'ALERTS_VIEW'];
    const visible = hrefs(visibleNavItems(viewer));

    // Always-visible (no permission) entries present.
    expect(visible).toContain('/dashboard');
    // Broadly-viewable gated entries the viewer DOES hold.
    expect(visible).toContain('/kpis');
    expect(visible).toContain('/dashboards');
    expect(visible).toContain('/alerts');
    // Admin-only entries are excluded.
    expect(visible).not.toContain('/roles');
    expect(visible).not.toContain('/settings');
    expect(visible).not.toContain('/users');
    expect(visible).not.toContain('/org-units');
    expect(visible).not.toContain('/positions');
    expect(visible).not.toContain('/settings/audit');
    expect(visible).not.toContain('/integrations');
  });

  test('empty permission set still shows the no-permission items', () => {
    expect(hrefs(visibleNavItems([]))).toEqual(PUBLIC_HREFS);
  });
});

describe('filterNav (ready gating)', () => {
  test('while not ready, shows only the no-permission items (avoids empty-nav flash)', () => {
    expect(hrefs(filterNav(NAV_ITEMS, [], false))).toEqual(PUBLIC_HREFS);
  });

  test('while not ready, gated items stay hidden even if cache happens to have them', () => {
    // Defensive: until ready, we do not reveal gated items based on a partial cache.
    const visible = hrefs(filterNav(NAV_ITEMS, ['ROLES_MANAGE'], false));
    expect(visible).not.toContain('/roles');
    expect(visible).toEqual(PUBLIC_HREFS);
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

describe('filterNavGroups', () => {
  test('admin sees all five groups intact', () => {
    const groups = filterNavGroups(NAV_GROUPS, ADMIN_PERMISSIONS, true);
    expect(groups.map((g) => g.group)).toEqual([
      'Workspace',
      'Measure',
      'Intelligence',
      'Execute',
      'Organize',
    ]);
  });

  test('drops groups whose items are all gated away', () => {
    // Only KPI_VIEW → Measure keeps KPIs; Intelligence is fully gated and dropped.
    const groups = filterNavGroups(NAV_GROUPS, ['KPI_VIEW'], true);
    const names = groups.map((g) => g.group);
    expect(names).toContain('Workspace');
    expect(names).toContain('Measure');
    expect(names).toContain('Execute'); // OKRs/Tasks/Approvals are public
    expect(names).not.toContain('Intelligence'); // all items need INSIGHTS_VIEW/ANALYTICS_VIEW
  });

  test('while not ready, only groups with at least one public item survive', () => {
    const groups = filterNavGroups(NAV_GROUPS, ADMIN_PERMISSIONS, false);
    // Pre-ready, only no-permission items show. Workspace (Dashboard), Execute
    // (OKRs/Tasks/Approvals) and Organize (Activity) each keep a public item;
    // Measure and Intelligence are fully gated → dropped.
    expect(groups.map((g) => g.group)).toEqual(['Workspace', 'Execute', 'Organize']);
    const organize = groups.find((g) => g.group === 'Organize');
    expect(organize?.items.map((i) => i.href)).toEqual(['/activity']);
  });
});
