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
  headingForPath,
  matchNavHref,
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
const PUBLIC_HREFS = ['/dashboard', '/my-kpis', '/team', '/okrs', '/tasks', '/approvals', '/activity'];

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
    expect(visible).not.toContain('/workflows');
    expect(visible).not.toContain('/connectors');
    expect(visible).not.toContain('/plugins');
    expect(visible).not.toContain('/billing');
  });

  // UI-013: the link follows the key the page's API checks.
  test('Ask is for those who hold INSIGHTS_VIEW — the key its API asks for', () => {
    expect(hrefs(visibleNavItems(['INSIGHTS_VIEW']))).toContain('/ask');
    expect(hrefs(visibleNavItems(['ANALYTICS_VIEW']))).not.toContain('/ask');
  });

  // UI-012: these pages existed and nothing led to them.
  test('every page that used to have no link is in the navigation', () => {
    const all = hrefs(NAV_ITEMS);
    for (const href of ['/my-kpis', '/team', '/workflows', '/connectors', '/plugins', '/billing']) expect(all).toContain(href);
  });

  test('each link asks for what its page asks for', () => {
    // Automations, Plugins and Billing are administrator pages.
    expect(hrefs(visibleNavItems(['ORG_SETTINGS']))).toEqual(expect.arrayContaining(['/workflows', '/plugins', '/billing', '/connectors']));
    // Connectors opens with either key, like its page.
    expect(hrefs(visibleNavItems(['INTEGRATIONS_MANAGE']))).toContain('/connectors');
    expect(hrefs(visibleNavItems(['INTEGRATIONS_MANAGE']))).not.toContain('/workflows');
    // My KPIs and Team are everyone's.
    expect(hrefs(visibleNavItems([]))).toEqual(expect.arrayContaining(['/my-kpis', '/team']));
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
    expect(names).not.toContain('Intelligence'); // all items need INSIGHTS_VIEW
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

describe('page-access (Layer-5) nav filtering', () => {
  test('default no-restriction leaves the admin nav unchanged (parity)', () => {
    const withDefault = hrefs(
      visibleNavItems(ADMIN_PERMISSIONS, NAV_ITEMS, { allow: null, deny: [] }),
    );
    expect(withDefault).toEqual(hrefs(visibleNavItems(ADMIN_PERMISSIONS)));
  });

  test('deny hides an otherwise-visible nav item', () => {
    const visible = hrefs(
      visibleNavItems(ADMIN_PERMISSIONS, NAV_ITEMS, { allow: null, deny: ['/kpis'] }),
    );
    expect(visible).not.toContain('/kpis');
    expect(visible).toContain('/dashboards');
  });

  test('allow list restricts the nav to listed (and capability-held) items', () => {
    const visible = hrefs(
      visibleNavItems(ADMIN_PERMISSIONS, NAV_ITEMS, {
        allow: ['/dashboard', '/kpis'],
        deny: [],
      }),
    );
    expect(visible).toEqual(['/dashboard', '/kpis']);
  });

  test('filterNav threads page-access through once ready', () => {
    const visible = hrefs(
      filterNav(NAV_ITEMS, ADMIN_PERMISSIONS, true, { allow: null, deny: ['/roles'] }),
    );
    expect(visible).not.toContain('/roles');
    expect(visible).toContain('/users');
  });
});

describe('matchNavHref (route-guard mapping)', () => {
  test('exact nav href matches itself', () => {
    expect(matchNavHref('/kpis')).toBe('/kpis');
  });
  test('child route maps to its parent nav href', () => {
    expect(matchNavHref('/kpis/123')).toBe('/kpis');
  });
  test('picks the MOST SPECIFIC nav href', () => {
    // /settings and /settings/audit are both nav items; the deeper route wins.
    expect(matchNavHref('/settings/audit')).toBe('/settings/audit');
    expect(matchNavHref('/settings/audit/x')).toBe('/settings/audit');
    expect(matchNavHref('/settings/org')).toBe('/settings');
  });
  test('non-nav routes map to null (never gated)', () => {
    expect(matchNavHref('/profile')).toBeNull();
    expect(matchNavHref('/me/sessions')).toBeNull();
    expect(matchNavHref('/unauthorized')).toBeNull();
    expect(matchNavHref('/login')).toBeNull();
  });
});

// A settings page used to be headed "Organize / Settings" whichever one it was,
// with nothing in the trail to go back by.
describe('headingForPath', () => {
  test('a settings page is named, and its trail leads back to Settings', () => {
    expect(headingForPath('/settings/fiscal')).toEqual({
      title: 'Fiscal calendar',
      crumbs: [{ label: 'Settings', href: '/settings' }],
    });
    expect(headingForPath('/settings/password-policy').title).toBe('Password policy');
    expect(headingForPath('/settings/api-keys').title).toBe('API keys');
  });
  test('a page under a settings page leads back through both', () => {
    expect(headingForPath('/settings/notifications/dlq')).toEqual({
      title: 'Failed deliveries',
      crumbs: [
        { label: 'Settings', href: '/settings' },
        { label: 'Notifications', href: '/settings/notifications' },
      ],
    });
  });
  test('a settings page with no name of its own is named from its address', () => {
    expect(headingForPath('/settings/something-new')).toEqual({
      title: 'Something new',
      crumbs: [{ label: 'Settings', href: '/settings' }],
    });
  });
  test('every other page keeps its section crumb', () => {
    expect(headingForPath('/settings')).toEqual({ title: 'Settings', crumbs: [{ label: 'Organize' }] });
    expect(headingForPath('/kpis/abc')).toEqual({ title: 'KPIs', crumbs: [{ label: 'Workspace' }] });
  });
  test('every page the Settings index links to under /settings has a name', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
    const links = [...src.matchAll(/href: '\/settings\/([a-z-]+)', title: '([^']+)'/g)];
    expect(links.length).toBeGreaterThan(8);
    for (const [, slug, title] of links) {
      expect(headingForPath(`/settings/${slug}`).title, slug).toBe(title);
    }
  });
});
