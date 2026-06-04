/**
 * Access-profile utility functions + localStorage cache helpers (FE mirror of
 * the backend AccessProfile). Lets components read "whose data / how much" the
 * current user may see, in addition to the can-do-X permission checks in
 * `permissions.ts`. SSR-safe — every accessor guards `typeof window`.
 */

import type { AccessProfile, Domain, Scope } from '@kpi-nexus/contracts';

const ACCESS_PROFILE_KEY = 'kpi-nexus.access-profile';

/** Scope ordering — a wider scope subsumes the narrower ones. */
const SCOPE_RANK: Record<Scope, number> = {
  SELF: 0,
  DIRECT_REPORTS: 1,
  UNITS: 2,
  ORG: 3,
};

/** Read the cached access profile from localStorage (null when absent/invalid). */
export function getCachedAccessProfile(): AccessProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACCESS_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AccessProfile;
  } catch {
    return null;
  }
}

/** Persist the resolved access profile for synchronous reads by `useAccess`. */
export function setCachedAccessProfile(profile: AccessProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_PROFILE_KEY, JSON.stringify(profile));
}

export function clearCachedAccessProfile(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_PROFILE_KEY);
}

/** The effective scope for a domain (admins ⇒ ORG; default ORG when unset). */
export function scopeForDomain(profile: AccessProfile | null, domain: Domain): Scope {
  if (!profile) return 'ORG';
  if (profile.isAdmin) return 'ORG';
  return profile.scopeByDomain[domain] ?? 'ORG';
}

/** True when the user's domain scope is at least as wide as `required`. */
export function scopeAtLeast(
  profile: AccessProfile | null,
  domain: Domain,
  required: Scope,
): boolean {
  return SCOPE_RANK[scopeForDomain(profile, domain)] >= SCOPE_RANK[required];
}

// ---------------------------------------------------------------------------
// Phase 7 — Layer-5 page access (nav filtering + route guard).
// ---------------------------------------------------------------------------

/** The resolved page-access shape carried on the AccessProfile. */
export type PageAccessResolved = AccessProfile['pageAccess'];

/** The default/admin/unset value — no page is restricted. */
export const NO_PAGE_RESTRICTION: PageAccessResolved = { allow: null, deny: [] };

/**
 * True when `href` is reachable under the given page-access config.
 *
 * Semantics (implement EXACTLY): deny wins, then an `allow` list (when non-null)
 * acts as an allowlist. A null/undefined config ⇒ no restriction.
 */
export function isPageAllowed(
  pageAccess: PageAccessResolved | null | undefined,
  href: string,
): boolean {
  if (!pageAccess) return true;
  if (pageAccess.deny.includes(href)) return false;
  return pageAccess.allow == null || pageAccess.allow.includes(href);
}

/**
 * The effective page-access for a profile. Admins (and a null profile) are never
 * page-restricted; otherwise fall back to no-restriction when `pageAccess` is unset.
 */
export function pageAccessOf(profile: AccessProfile | null): PageAccessResolved {
  if (!profile || profile.isAdmin) return NO_PAGE_RESTRICTION;
  return profile.pageAccess ?? NO_PAGE_RESTRICTION;
}
