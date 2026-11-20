'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  AtSign,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Cable,
  CheckSquare,
  ChevronsUpDown,
  ClipboardCheck,
  CreditCard,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LogOut,
  type LucideProps,
  Menu,
  Moon,
  PanelLeft,
  Plug,
  Puzzle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  User,
  UserCheck,
  UserCog,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';

import { AlertsBell } from './alerts-bell';
import { GlobalSearch } from './global-search';
import { HelpDrawer } from './help-drawer';
import { cn } from '../lib/cn';
import {
  type AuthUser,
  getAccessToken,
  logoutRequest,
  meRequest,
} from '../lib/api-client';
import { mentionUnreadCount } from '../lib/collab-client';
import {
  NO_PAGE_RESTRICTION,
  isPageAllowed,
  type PageAccessResolved,
} from '../lib/access';
import { useBranding } from '../lib/branding-context';
import { navLabelFor } from '../lib/nav-terminology';
import { useTerminology } from '../lib/terminology-context';
import { usePageAccess } from '../lib/use-page-access';
import { usePermissions } from '../lib/use-permissions';

// ---------------------------------------------------------------------------
// Central nav config — grouped, permission-filtered (design: MEASURE /
// INTELLIGENCE / EXECUTE / ORGANIZE). `data-testid="nav-<slug>"` is preserved
// on every leaf so e2e selectors keep resolving.
// ---------------------------------------------------------------------------

type IconType = ComponentType<LucideProps>;

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  /**
   * Canonical permission key required to see this entry. Omitted entries are
   * visible to everyone (admin holds every key, so they always see all).
   */
  permission?: string;
  /**
   * For a page that opens with any one of several keys (its own gate is
   * `RequireAnyPermission`): shown when at least one is held.
   */
  anyOf?: string[];
  /**
   * Override for the derived `data-testid`. Use when the route doesn't map
   * cleanly to the legacy testid (e.g. `/settings/audit` must keep `nav-audit`).
   */
  testId?: string;
}

export interface NavGroup {
  /** Section heading shown above the items (uppercase eyebrow). */
  group: string;
  items: NavItem[];
}

/**
 * The single source of truth for the primary application navigation, grouped
 * into the design's four sections. The keys here are the canonical
 * permissions (see `packages/contracts/src/permissions.ts`). Use these EXACT
 * keys — never invent new ones.
 *
 * NOTE: every item's testid is derived as `nav-<href without leading slash,
 * slashes → dashes>` (see `navTestId`). The MUST-KEEP ids — nav-dashboard,
 * nav-kpis, nav-reports, nav-roles, nav-positions, nav-audit, nav-settings —
 * all resolve here.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/my-kpis', label: 'My KPIs', icon: UserCheck },
      { href: '/team', label: 'My team', icon: UsersRound },
    ],
  },
  {
    group: 'Measure',
    items: [
      { href: '/kpis', label: 'KPIs', icon: Target, permission: 'KPI_VIEW' },
      { href: '/dashboards', label: 'Dashboards', icon: BarChart3, permission: 'DASHBOARD_VIEW' },
      { href: '/alerts', label: 'Alerts', icon: Bell, permission: 'ALERTS_VIEW' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { href: '/insights', label: 'Insights', icon: Lightbulb, permission: 'INSIGHTS_VIEW' },
      { href: '/recommendations', label: 'Recommendations', icon: Sparkles, permission: 'INSIGHTS_VIEW' },
      { href: '/ask', label: 'Ask', icon: Bot, permission: 'INSIGHTS_VIEW' },
    ],
  },
  {
    group: 'Execute',
    items: [
      { href: '/okrs', label: 'OKRs', icon: ListChecks },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
      { href: '/workflows', label: 'Automations', icon: Zap, permission: 'ORG_SETTINGS' },
      { href: '/reports', label: 'Reports', icon: FileText, permission: 'REPORTS_VIEW' },
    ],
  },
  {
    group: 'Organize',
    items: [
      { href: '/users', label: 'People', icon: Users, permission: 'USERS_VIEW' },
      { href: '/roles', label: 'Roles', icon: KeyRound, permission: 'ROLES_MANAGE' },
      {
        href: '/settings/access',
        label: 'Access Center',
        icon: SlidersHorizontal,
        permission: 'USERS_MANAGE',
        testId: 'nav-access',
      },
      { href: '/positions', label: 'Positions', icon: UserCog, permission: 'POSITIONS_MANAGE' },
      // "Teams", as the page it opens is titled (it said "Org units").
      { href: '/org-units', label: 'Teams', icon: Building2, permission: 'GROUPS_VIEW' },
      { href: '/integrations', label: 'Integrations', icon: Plug, permission: 'INTEGRATIONS_MANAGE' },
      { href: '/connectors', label: 'Connectors', icon: Cable, anyOf: ['INTEGRATIONS_MANAGE', 'ORG_SETTINGS'] },
      { href: '/plugins', label: 'Plugins', icon: Puzzle, permission: 'ORG_SETTINGS' },
      { href: '/activity', label: 'Activity', icon: History },
      { href: '/settings/audit', label: 'Audit', icon: ShieldCheck, permission: 'AUDIT_VIEW', testId: 'nav-audit' },
      { href: '/billing', label: 'Billing', icon: CreditCard, permission: 'ORG_SETTINGS' },
      { href: '/settings', label: 'Settings', icon: Settings, permission: 'ORG_SETTINGS' },
    ],
  },
];

/** Flat list of every nav item, in render order (handy for filtering/tests). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** `/org-units` → `nav-org-units`, `/dashboard` → `nav-dashboard`. */
export function navTestId(href: string): string {
  const slug = href.replace(/^\//, '').replace(/\//g, '-');
  return `nav-${slug || 'dashboard'}`;
}

// ---------------------------------------------------------------------------
// Pure filtering — testable without React. Signatures are kept identical to
// the pre-redesign shell so the security-relevant logic stays covered.
// ---------------------------------------------------------------------------

/**
 * Returns the nav items the given permission set is allowed to see, assuming
 * permissions are fully resolved (ready). An item is shown iff it passes BOTH:
 * its capability gate (no `permission`, or the key is held) AND its Layer-5
 * page-access gate ({@link isPageAllowed}). The default `pageAccess`
 * ({@link NO_PAGE_RESTRICTION}) allows everything, so existing callers are
 * unaffected.
 *
 * @see filterNav for the ready-aware variant used by the live nav.
 */
export function visibleNavItems(
  permissions: string[],
  items: NavItem[] = NAV_ITEMS,
  pageAccess: PageAccessResolved = NO_PAGE_RESTRICTION,
): NavItem[] {
  return items.filter(
    (item) =>
      (!item.permission || permissions.includes(item.permission)) &&
      (!item.anyOf || item.anyOf.some((key) => permissions.includes(key))) &&
      isPageAllowed(pageAccess, item.href),
  );
}

/**
 * Ready-aware nav filter.
 *
 * - While `!isReady`, only the no-permission items are shown. This avoids both
 *   a flash of an empty nav and a flash of gated items based on a stale or
 *   partial permission cache.
 * - Once `isReady`, behaves like {@link visibleNavItems} — also applying the
 *   page-access allow/deny lists.
 */
export function filterNav(
  items: NavItem[],
  permissions: string[],
  isReady: boolean,
  pageAccess: PageAccessResolved = NO_PAGE_RESTRICTION,
): NavItem[] {
  if (!isReady) {
    return items.filter((item) => !item.permission && !item.anyOf);
  }
  return visibleNavItems(permissions, items, pageAccess);
}

/**
 * Apply {@link filterNav} per group and drop any group left empty. Returns the
 * grouped structure the sidebar renders.
 */
export function filterNavGroups(
  groups: NavGroup[],
  permissions: string[],
  isReady: boolean,
  pageAccess: PageAccessResolved = NO_PAGE_RESTRICTION,
): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: filterNav(g.items, permissions, isReady, pageAccess) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Resolve a pathname to the MOST SPECIFIC nav href it maps to (exact match or a
 * slash-prefixed child), or `null` when it maps to no nav item. Used by the
 * route guard so only nav-configurable routes are gated — pages like `/profile`
 * or `/unauthorized` are never locked out by an allow-list.
 */
export function matchNavHref(pathname: string): string | null {
  const matches = NAV_ITEMS.map((i) => i.href).filter(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Topbar title derivation
// ---------------------------------------------------------------------------

const TITLES: Record<string, { title: string; crumb: string }> = {
  dashboard: { title: 'Dashboard', crumb: 'Home' },
  // The group the menu files them under: these three said "Workspace", another group of the same menu.
  kpis: { title: 'KPIs', crumb: 'Measure' },
  dashboards: { title: 'Dashboards', crumb: 'Measure' },
  alerts: { title: 'Alerts', crumb: 'Measure' },
  insights: { title: 'Insights', crumb: 'Intelligence' },
  recommendations: { title: 'Recommendations', crumb: 'Intelligence' },
  ask: { title: 'Ask', crumb: 'Intelligence' },
  okrs: { title: 'OKRs', crumb: 'Execute' },
  tasks: { title: 'Tasks', crumb: 'Execute' },
  approvals: { title: 'Approvals', crumb: 'Execute' },
  reports: { title: 'Reports', crumb: 'Execute' },
  users: { title: 'People', crumb: 'Organize' },
  roles: { title: 'Roles', crumb: 'Organize' },
  positions: { title: 'Positions', crumb: 'Organize' },
  'org-units': { title: 'Teams', crumb: 'Organize' },
  integrations: { title: 'Integrations', crumb: 'Organize' },
  activity: { title: 'Activity', crumb: 'Organize' },
  audit: { title: 'Audit', crumb: 'Organize' },
  settings: { title: 'Settings', crumb: 'Organize' },
  billing: { title: 'Billing', crumb: 'Organize' },
  me: { title: 'Inbox', crumb: 'You' },
  profile: { title: 'Profile', crumb: 'You' },
};

function titleForPath(pathname: string): { title: string; crumb: string } {
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  return (
    TITLES[seg] ?? {
      title: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      crumb: 'Workspace',
    }
  );
}

/** The pages under /settings, by the name the Settings index gives each. */
const SETTINGS_TITLES: Record<string, string> = {
  organization: 'Organization',
  branding: 'Branding',
  fiscal: 'Fiscal calendar',
  'password-policy': 'Password policy',
  sso: 'Single sign-on',
  scim: 'SCIM provisioning',
  audit: 'Audit log',
  'custom-domain': 'Custom domain',
  notifications: 'Notifications',
  'notifications/dlq': 'Failed deliveries',
  ai: 'AI',
  'api-keys': 'API keys',
  webhooks: 'Webhooks',
  retention: 'Data retention',
  access: 'Access Center',
};

const sentence = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

/**
 * The top bar's title and the trail before it, for a page that gives neither.
 * A page under /settings is named, and its trail leads back to Settings (and to
 * the settings page above it); it used to read "Organize / Settings" whichever
 * page it was, with nothing to go back by.
 */
export function headingForPath(pathname: string): { title: string; crumbs: Array<{ label: string; href?: string }> } {
  const segs = pathname.split('/').filter(Boolean);
  if (segs[0] === 'settings' && segs.length > 1) {
    const crumbs: Array<{ label: string; href?: string }> = [{ label: 'Settings', href: '/settings' }];
    for (let i = 1; i < segs.length - 1; i++) {
      const key = segs.slice(1, i + 1).join('/');
      crumbs.push({ label: SETTINGS_TITLES[key] ?? sentence(segs[i]!), href: `/settings/${key}` });
    }
    const key = segs.slice(1).join('/');
    return { title: SETTINGS_TITLES[key] ?? sentence(segs[segs.length - 1]!), crumbs };
  }
  const derived = titleForPath(pathname);
  return { title: derived.title, crumbs: [{ label: derived.crumb }] };
}

// ---------------------------------------------------------------------------
// AppShell component
// ---------------------------------------------------------------------------

const SIDEBAR_KEY = 'kpi-nexus.sidebar-collapsed';

/** A breadcrumb entry: a bare label, or a labelled link. */
export type Crumb = string | { label: string; href?: string };

interface AppShellProps {
  children: ReactNode;
  /**
   * Override the route-derived page title shown in the topbar. Use for
   * dynamic routes (e.g. a KPI's name on `/kpis/[id]`) the static title map
   * can't know. Defaults to the {@link titleForPath} title.
   */
  title?: string;
  /**
   * Override the route-derived breadcrumb trail leading up to the title. Each
   * entry is a bare label or `{ label, href }` (rendered as a link). A trailing
   * crumb equal to the title is dropped to avoid duplication. Defaults to the
   * single section crumb from {@link titleForPath}.
   */
  crumbs?: Crumb[];
}

function initialsOf(input: string): string {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Shared authenticated chrome: the design's sidebar + topbar layout. The
 * 256px sidebar (collapsible to 64px) holds the brand/org switcher, the
 * grouped permission-filtered nav, and the bottom user menu. The topbar holds
 * the sidebar toggle, breadcrumb + page title, global search, alerts bell, a
 * mentions bell, and a theme toggle. `children` render in a scroll container
 * capped at 1180px. The contextual `<HelpDrawer/>` sits in the top bar on every page.
 */
export function AppShell({ children, title, crumbs }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { permissions, ready } = usePermissions();
  const { pageAccess, ready: pageAccessReady } = usePageAccess();
  const { terminology } = useTerminology();
  const { resolvedTheme, setTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Below md the sidebar is an off-canvas drawer (FE-017); `collapsed` is desktop-only.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Permissions live in localStorage (unavailable during SSR). Reveal gated
  // items only after mount so SSR and the first client render agree.
  const [mounted, setMounted] = useState(false);
  // How many mentions are waiting. A failure leaves the bell plain rather than
  // showing an error in the top bar; the mentions page reports its own.
  const [unreadMentions, setUnreadMentions] = useState(0);
  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    mentionUnreadCount().then(
      ({ count }) => {
        if (!cancelled) setUnreadMentions(count);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === '1');
    }
  }, []);

  // Best-effort load of the signed-in user for the sidebar footer + header
  // identity. Re-runs when the profile page edits the name (custom event) so
  // the displayed identity stays in sync without a full reload.
  useEffect(() => {
    let cancelled = false;
    const loadUser = () => {
      if (!getAccessToken()) return;
      void meRequest()
        .then((res) => {
          if (!cancelled) setUser(res.user);
        })
        .catch(() => {
          /* footer identity is non-critical */
        });
    };
    loadUser();
    if (typeof window !== 'undefined') {
      window.addEventListener('kpi-nexus:profile-updated', loadUser);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('kpi-nexus:profile-updated', loadUser);
      }
    };
  }, []);

  // Close the user menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* private mode — ignore persistence failure */
      }
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutRequest();
    router.push('/login');
  }, [router]);

  const isDark = resolvedTheme === 'dark';
  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Until mounted, behave as "not ready" so SSR and the first client render
  // agree (no-permission items only). After mount, honour the resolved state.
  // Page-access only narrows the nav once it's resolved; until then we pass
  // NO_PAGE_RESTRICTION so nothing is wrongly hidden during load.
  const effectivePageAccess =
    mounted && pageAccessReady ? pageAccess : NO_PAGE_RESTRICTION;
  // Labels follow the org's custom terminology (FE-007), e.g. "Permission Tiers".
  const groups = filterNavGroups(
    NAV_GROUPS,
    permissions,
    mounted && ready,
    effectivePageAccess,
  ).map((g) => ({
    ...g,
    items: g.items.map((item) => ({ ...item, label: navLabelFor(item.href, item.label, terminology) })),
  }));

  // Layer-5 route guard: gate the CURRENT route only when it maps to a nav href
  // (most-specific match). Routes with no nav mapping (e.g. /profile,
  // /me/sessions, /unauthorized, /login) are NEVER gated, so an allow-list can't
  // lock the user out of non-configurable pages. Only redirect once resolved to
  // avoid a flash-redirect on a stale/empty cache.
  useEffect(() => {
    if (!(mounted && pageAccessReady)) return;
    // Signed out: the page's own redirect sends the user to sign in (with
    // ?next=); don't race it to "/unauthorized" with empty access (FE-009).
    if (!getAccessToken()) return;
    const matched = matchNavHref(pathname);
    if (matched && !isPageAllowed(pageAccess, matched)) {
      router.replace('/unauthorized');
    }
  }, [mounted, pageAccessReady, pageAccess, pathname, router]);

  const email = user?.email ?? '';
  // The organisation's name and logo head the sidebar, once they are known.
  const { branding } = useBranding();
  const name = user?.fullName || user?.email || 'You';
  const initials = initialsOf(name);
  const derived = headingForPath(pathname);
  const pageTitle = title ?? derived.title;
  // Normalize the crumb trail; drop a trailing crumb identical to the title so
  // pages that include their own leaf in `crumbs` don't render it twice.
  const crumbTrail = (
    crumbs && crumbs.length > 0
      ? crumbs.map((c) => (typeof c === 'string' ? { label: c } : c))
      : derived.crumbs
  ).filter((c) => c.label && c.label !== pageTitle);

  // The mobile drawer is always full width, so it always shows labels.
  const showLabels = !collapsed || mobileNavOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg text-content-default">
      {/* ----------------------------- Sidebar ----------------------------- */}
      {mobileNavOpen && (
        <div
          aria-hidden
          data-testid="mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <aside
        id="app-sidebar"
        className={cn(
          'flex h-full shrink-0 flex-col border-r border-border bg-surface-1 transition-[width,transform] duration-base ease-out',
          // Phones: fixed drawer, hidden until opened. md+: in-flow, collapsible.
          'fixed inset-y-0 left-0 z-40 w-64 md:static md:z-auto md:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
        {/* Brand / org switcher */}
        <Link
          href="/dashboard"
          aria-label="KPI Nexus — go to dashboard"
          className={cn(
            'flex h-14 shrink-0 items-center gap-2 px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center px-0',
          )}
        >
          {branding.logoUrl ? (
            // The organisation's own logo, from the address it gave: not an asset the build can optimise.
            <img src={branding.logoUrl} alt="" data-testid="brand-logo" className="h-7 w-7 shrink-0 rounded-lg object-contain" />
          ) : (
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-brand shadow-sm"
            >
              <Target className="h-4 w-4 text-white" />
            </span>
          )}
          {showLabels && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span data-testid="brand-name" className="truncate text-[13.5px] font-bold tracking-tight text-content-strong">
                {branding.name ?? 'KPI Nexus'}
              </span>
              <span className="truncate text-[11px] text-content-muted">{branding.name ? 'KPI Nexus' : 'Workspace'}</span>
            </span>
          )}
          {showLabels && (
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden />
          )}
        </Link>

        {/* Grouped nav */}
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-1.5">
          {groups.map((g) => (
            <div key={g.group} className="mb-2.5">
              {showLabels && (
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-content-muted">
                  {g.group}
                </p>
              )}
              {g.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={item.testId ?? navTestId(item.href)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'mb-0.5 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-accent-bg font-semibold text-accent-primary'
                        : 'text-content-default hover:bg-surface-hover hover:text-content-strong',
                    )}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                    {showLabels && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User menu */}
        <div className="relative shrink-0 border-t border-border p-2.5" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label="Account menu"
            data-testid="appshell-user-menu"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left outline-none transition-colors',
              'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'justify-center px-0',
            )}
          >
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent-bg text-xs font-semibold text-accent-primary"
            >
              {initials}
            </span>
            {showLabels && (
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-semibold text-content-strong">
                  {name}
                </span>
                <span
                  data-testid="appshell-user-email"
                  className="truncate text-[11px] text-content-muted"
                >
                  {email}
                </span>
              </span>
            )}
            {showLabels && (
              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden />
            )}
          </button>

          {/* Keep the email testid present even when collapsed (e2e relies on it). */}
          {!showLabels && (
            <span data-testid="appshell-user-email" className="sr-only">
              {email}
            </span>
          )}

          {userMenuOpen && (
            <div
              role="menu"
              aria-label="Account"
              className="absolute bottom-[calc(100%+6px)] left-2.5 right-2.5 z-50 overflow-hidden rounded-lg border border-border bg-surface-bg py-1 shadow-pop"
            >
              <Link
                href="/profile"
                role="menuitem"
                data-testid="appshell-profile-link"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-content-default outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <User className="h-4 w-4 text-content-muted" aria-hidden />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                data-testid="appshell-theme-toggle-menu"
                onClick={() => {
                  toggleTheme();
                  setUserMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-content-default outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
              >
                {isDark ? (
                  <Sun className="h-4 w-4 text-content-muted" aria-hidden />
                ) : (
                  <Moon className="h-4 w-4 text-content-muted" aria-hidden />
                )}
                {isDark ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="appshell-signout-button"
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-status-critical outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* --------------------------- Main column --------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-1/80 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            data-testid="mobile-nav-toggle"
            aria-label="Open navigation"
            aria-controls="app-sidebar"
            aria-expanded={mobileNavOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            data-testid="sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring md:flex"
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>

          <div className="flex min-w-0 items-center gap-1.5" data-testid="top-bar-trail">
            {crumbTrail.map((c) => (
              <Fragment key={c.label}>
                {'href' in c && c.href ? (
                  <Link
                    href={c.href}
                    className="hidden text-[13px] text-content-muted transition-colors hover:text-content-strong sm:inline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="hidden text-[13px] text-content-muted sm:inline">{c.label}</span>
                )}
                <span className="hidden text-content-disabled sm:inline" aria-hidden>
                  /
                </span>
              </Fragment>
            ))}
            {/* Where you are, not a heading: the page has its own, and two top-level headings named every
                page twice to a screen reader. */}
            <span data-testid="top-bar-title" aria-current="page" className="truncate text-sm font-semibold text-content-strong">
              {pageTitle}
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <GlobalSearch />
            {/* The bell reads alerts, which needs ALERTS_VIEW: without it there is nothing to show and every poll would be refused. */}
            {ready && permissions.includes('ALERTS_VIEW') && <AlertsBell />}
            <Link
              href="/me/mentions"
              data-testid="mentions-bell"
              aria-label={unreadMentions > 0 ? `Mentions, ${unreadMentions} unread` : 'Mentions'}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AtSign className="h-[18px] w-[18px]" aria-hidden />
              {unreadMentions > 0 && (
                <span
                  data-testid="mentions-badge"
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-[10px] font-bold leading-none text-white"
                >
                  {unreadMentions > 9 ? '9+' : unreadMentions}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label="Toggle theme"
              className="hidden h-9 w-9 items-center sm:flex justify-center rounded-md text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Render a stable icon until mounted to avoid hydration mismatch. */}
              {mounted && isDark ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden />
              )}
            </button>
            {/* Help for the page being looked at. Here, not floating over the page's own buttons. */}
            <HelpDrawer />
          </div>
        </header>

        {/* Scroll container */}
        {/* tabIndex -1: following "Skip to content" moves the keyboard here, so the next Tab is in the page. */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
