'use client';

import { useEffect, useState } from 'react';

import {
  NO_PAGE_RESTRICTION,
  getCachedAccessProfile,
  pageAccessOf,
  type PageAccessResolved,
} from './access';

export interface UsePageAccessResult {
  /** The resolved page-access config for the current user (no-restriction default). */
  pageAccess: PageAccessResolved;
  /** True once we have read the cached access profile after mount. */
  ready: boolean;
}

/**
 * Hook that provides the current user's Layer-5 page access.
 *
 * Mirrors {@link usePermissions}: it starts with `NO_PAGE_RESTRICTION` /
 * `ready: false` so the server render and the client's FIRST render agree
 * (reading localStorage during render would cause a hydration mismatch). The
 * cached access profile is read in a `useEffect` after mount instead.
 *
 * The cache is populated by `useAccess` / the auth flow via `/auth/me`; this
 * hook is read-only and never fires a request itself (matching how the access
 * profile is hydrated elsewhere). When the profile is absent, admin, or has no
 * `pageAccess`, this resolves to {@link NO_PAGE_RESTRICTION} — parity with the
 * default case where nothing is hidden or gated.
 */
export function usePageAccess(): UsePageAccessResult {
  const [pageAccess, setPageAccess] = useState<PageAccessResolved>(NO_PAGE_RESTRICTION);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    function read() {
      setPageAccess(pageAccessOf(getCachedAccessProfile()));
      setReady(true);
    }

    read();

    // Re-read if another tab/flow updates the cached profile.
    function onStorage(e: StorageEvent) {
      if (e.key === 'kpi-nexus.access-profile') read();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { pageAccess, ready };
}
