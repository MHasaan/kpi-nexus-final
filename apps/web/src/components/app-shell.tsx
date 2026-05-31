'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AlertsBell } from './alerts-bell';
import { GlobalSearch } from './global-search';
import { HelpDrawer } from './help-drawer';
import {
  type AuthUser,
  getAccessToken,
  logoutRequest,
  meRequest,
} from '../lib/api-client';
import { usePermissions } from '../lib/use-permissions';

// ---------------------------------------------------------------------------
// Central nav config
// ---------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  /**
   * Canonical permission key required to see this entry. Omitted entries are
   * visible to everyone (admin holds all 18 keys, so they always see all).
   */
  permission?: string;
}

/**
 * The single source of truth for the primary application navigation.
 *
 * Entries with a `permission` are hidden from users who lack that key. The
 * keys here are the 18 canonical permissions (see
 * `packages/contracts/src/permissions.ts`). Use these EXACT keys.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboards', label: 'Dashboards', permission: 'DASHBOARD_VIEW' },
  { href: '/kpis', label: 'KPIs', permission: 'KPI_VIEW' },
  { href: '/users', label: 'Members', permission: 'USERS_VIEW' },
  { href: '/org-units', label: 'Teams', permission: 'GROUPS_VIEW' },
  { href: '/roles', label: 'Roles', permission: 'ROLES_MANAGE' },
  { href: '/alerts', label: 'Alerts', permission: 'ALERTS_VIEW' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings', permission: 'ORG_SETTINGS' },
];

// ---------------------------------------------------------------------------
// Pure filtering — testable without React
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

// ---------------------------------------------------------------------------
// AppShell component
// ---------------------------------------------------------------------------

interface AppShellProps {
  children: ReactNode;
}

/**
 * Shared authenticated chrome: brand link, permission-filtered nav, global
 * search, alerts bell, signed-in user's email, and Sign out. Renders
 * `children` below the header.
 *
 * Pages wrap their content in `<AppShell>…</AppShell>` instead of hand-rolling
 * a header, giving one consistent, permission-filtered nav across surfaces.
 */
export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { permissions, ready } = usePermissions();
  const [user, setUser] = useState<AuthUser | null>(null);

  // Permissions live in localStorage, which is unavailable during SSR. To avoid
  // a hydration mismatch (server renders only the no-permission items; client
  // would otherwise render the full gated set on first paint), we only reveal
  // gated items after the component has mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load the signed-in user's email for the header. Best-effort: a failure
  // here must not break the page chrome.
  useEffect(() => {
    let cancelled = false;
    if (!getAccessToken()) return;
    void meRequest()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        /* header email is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logoutRequest();
    router.push('/login');
  }

  // Until mounted, behave as "not ready" so SSR and the first client render
  // agree (no-permission items only). After mount, honour the resolved state.
  const navItems = filterNav(NAV_ITEMS, permissions, mounted && ready);

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm" aria-label="Primary">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.href.replace(/^\//, '').replace(/\//g, '-') || 'dashboard'}`}
                  className={
                    isActive(item.href)
                      ? 'font-medium text-accent-primary'
                      : 'text-content-muted hover:text-content-strong'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <GlobalSearch />
            <AlertsBell />
            {user && (
              <span className="text-content-muted" data-testid="appshell-user-email">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              data-testid="appshell-signout-button"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {children}

      {/* Floating contextual-help drawer — visible on every AppShell page */}
      <HelpDrawer />
    </main>
  );
}
