/**
 * Phase 7 — the configurable pages for the Layer-5 page-access editors.
 *
 * Derived from the live nav ({@link NAV_GROUPS}) so the role/override editors
 * stay in sync with what the sidebar actually renders: every leaf nav route is
 * a page an admin can hide (deny) or restrict to (allow-list).
 */

import { NAV_GROUPS } from '../components/app-shell';

export interface PageRoute {
  href: string;
  label: string;
  group: string;
}

/** Flat list of every configurable nav route, grouped-section preserved. */
export const PAGE_ROUTES: PageRoute[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ href: i.href, label: i.label, group: g.group })),
);
