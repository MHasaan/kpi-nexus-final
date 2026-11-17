import { NAV_ITEMS, visibleNavItems } from '../components/app-shell';

import { NO_PAGE_RESTRICTION, type PageAccessResolved } from './access';

/** Somewhere everyone signed in can always open — it is on no access list. */
const ALWAYS_OPEN = { href: '/profile', label: 'your profile' } as const;

/**
 * The first page this person may open, in sidebar order — what a dead end
 * ("no access", "not found", an error) should offer instead of the dashboard,
 * which is itself closed to some people and then loops back to "no access".
 */
export function firstPageFor(permissions: string[], pageAccess: PageAccessResolved = NO_PAGE_RESTRICTION): { href: string; label: string } {
  const first = visibleNavItems(permissions, NAV_ITEMS, pageAccess)[0];
  return first ? { href: first.href, label: first.label } : ALWAYS_OPEN;
}
