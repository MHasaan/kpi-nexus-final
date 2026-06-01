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
  CheckSquare,
  ChevronsUpDown,
  ClipboardCheck,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LogOut,
  type LucideProps,
  Moon,
  PanelLeft,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  User,
  UserCog,
  Users,
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
   * visible to everyone (admin holds all 18 keys, so they always see all).
   */
  permission?: string;
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
 * into the design's four sections. The keys here are the 18 canonical
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
      { href: '/ask', label: 'Ask', icon: Bot, permission: 'ANALYTICS_VIEW' },
    ],
  },
  {
    group: 'Execute',
    items: [
      { href: '/okrs', label: 'OKRs', icon: ListChecks },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
      { href: '/reports', label: 'Reports', icon: FileText, permission: 'REPORTS_VIEW' },
    ],
  },
  {
    group: 'Organize',
    items: [
      { href: '/users', label: 'People', icon: Users, permission: 'USERS_VIEW' },
      { href: '/roles', label: 'Roles', icon: KeyRound, permission: 'ROLES_MANAGE' },
      { href: '/positions', label: 'Positions', icon: UserCog, permission: 'POSITIONS_MANAGE' },
      { href: '/org-units', label: 'Org units', icon: Building2, permission: 'GROUPS_VIEW' },
      { href: '/integrations', label: 'Integrations', icon: Plug, permission: 'ORG_SETTINGS' },
      { href: '/activity', label: 'Activity', icon: History },
      { href: '/settings/audit', label: 'Audit', icon: ShieldCheck, permission: 'ORG_SETTINGS', testId: 'nav-audit' },
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
 * permissions are fully resolved (ready). Entries without a `permission` are
 * always included; gated entries require the key be present.
 *
 * @see filterNav for the ready-aware variant used by the live nav.
 */
export function visibleNavItems(
  permissions: string[],
  items: NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );
}

/**
 * Ready-aware nav filter.
 *
 * - While `!isReady`, only the no-permission items are shown. This avoids both
 *   a flash of an empty nav and a flash of gated items based on a stale or
 *   partial permission cache.
 * - Once `isReady`, behaves like {@link visibleNavItems}.
 */
export function filterNav(
  items: NavItem[],
  permissions: string[],
  isReady: boolean,
): NavItem[] {
  if (!isReady) {
    return items.filter((item) => !item.permission);
  }
  return visibleNavItems(permissions, items);
}

/**
 * Apply {@link filterNav} per group and drop any group left empty. Returns the
 * grouped structure the sidebar renders.
 */
export function filterNavGroups(
  groups: NavGroup[],
  permissions: string[],
  isReady: boolean,
): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: filterNav(g.items, permissions, isReady) }))
    .filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Topbar title derivation
// ---------------------------------------------------------------------------

const TITLES: Record<string, { title: string; crumb: string }> = {
  dashboard: { title: 'Dashboard', crumb: 'Home' },
  kpis: { title: 'KPIs', crumb: 'Workspace' },
  dashboards: { title: 'Dashboards', crumb: 'Workspace' },
  alerts: { title: 'Alerts', crumb: 'Workspace' },
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
  'org-units': { title: 'Org units', crumb: 'Organize' },
  integrations: { title: 'Integrations', crumb: 'Organize' },
  activity: { title: 'Activity', crumb: 'Organize' },
  audit: { title: 'Audit', crumb: 'Organize' },
  settings: { title: 'Settings', crumb: 'Organize' },
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

// ---------------------------------------------------------------------------
// AppShell component
// ---------------------------------------------------------------------------

const SIDEBAR_KEY = 'kpi-nexus.sidebar-collapsed';

/** A breadcrumb entry: a bare label, or a labelled link. */
export type Crumb = string | { label: string; href?: string };

interface AppShellProps {
  children: ReactNode;
  /**
   * Override the route-derived page title shown in the topbar `<h1>`. Use for
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
 * capped at 1180px. The contextual `<HelpDrawer/>` stays mounted everywhere.
 */
export function AppShell({ children, title, crumbs }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { permissions, ready } = usePermissions();
  const { resolvedTheme, setTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Permissions live in localStorage (unavailable during SSR). Reveal gated
  // items only after mount so SSR and the first client render agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === '1');
    }
  }, []);

  // Best-effort load of the signed-in user for the sidebar footer.
  useEffect(() => {
    let cancelled = false;
    if (!getAccessToken()) return;
    void meRequest()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        /* footer identity is non-critical */
      });
    return () => {
      cancelled = true;
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
  const groups = filterNavGroups(NAV_GROUPS, permissions, mounted && ready);

  const email = user?.email ?? '';
  const name = user?.fullName || user?.email || 'You';
  const initials = initialsOf(name);
  const derived = titleForPath(pathname);
  const pageTitle = title ?? derived.title;
  // Normalize the crumb trail; drop a trailing crumb identical to the title so
  // pages that include their own leaf in `crumbs` don't render it twice.
  const crumbTrail = (
    crumbs && crumbs.length > 0
      ? crumbs.map((c) => (typeof c === 'string' ? { label: c } : c))
      : [{ label: derived.crumb }]
  ).filter((c) => c.label && c.label !== pageTitle);

  const showLabels = !collapsed;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg text-content-default">
      {/* ----------------------------- Sidebar ----------------------------- */}
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col border-r border-border bg-surface-1 transition-[width] duration-base ease-out',
          collapsed ? 'w-16' : 'w-64',
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
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-brand shadow-sm"
          >
            <Target className="h-4 w-4 text-white" />
          </span>
          {showLabels && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13.5px] font-bold tracking-tight text-content-strong">
                KPI Nexus
              </span>
              <span className="truncate text-[11px] text-content-muted">Workspace</span>
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
            onClick={toggleCollapsed}
            data-testid="sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
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
            <h1 className="truncate text-sm font-semibold text-content-strong">{pageTitle}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <AlertsBell />
            <Link
              href="/me/mentions"
              data-testid="mentions-bell"
              aria-label="Mentions"
              className="flex h-9 w-9 items-center justify-center rounded-md text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AtSign className="h-[18px] w-[18px]" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-md text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Render a stable icon until mounted to avoid hydration mismatch. */}
              {mounted && isDark ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden />
              )}
            </button>
          </div>
        </header>

        {/* Scroll container */}
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-7 py-6">{children}</div>
        </main>
      </div>

      {/* Floating contextual-help drawer — visible on every AppShell page */}
      <HelpDrawer />
    </div>
  );
}
