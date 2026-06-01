'use client';

import { useEffect, useState } from 'react';

import { meRequest } from './api-client';
import {
  getCachedPermissions,
  hasAny,
  hasPermission,
} from './permissions';

export interface UsePermissionsResult {
  /** The resolved permission keys for the current user. */
  permissions: string[];
  /** True once we have resolved permissions (either from cache or from the API). */
  ready: boolean;
  /** Check if the user has a specific permission key. */
  has: (key: string) => boolean;
  /** Check if the user has at least one of the given permission keys. */
  hasAny: (keys: string[]) => boolean;
}

/**
 * Hook that provides the current user's permissions.
 *
 * - Starts with `[]` / `ready: false` so the server render and the client's
 *   FIRST render agree (reading localStorage during render would cause a
 *   hydration mismatch — guarded actions would be hidden on the server but
 *   shown on the client's first paint). We populate after mount instead.
 * - After mount, reads the localStorage cache; if empty, fires `meRequest()`
 *   once to populate it.
 */
export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    // Hydrate from the synchronous cache first (no flash beyond the first paint).
    const cached = getCachedPermissions();
    if (cached.length > 0) {
      setPermissions(cached);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    // Cache empty — resolve from the API once.
    async function fetchMe() {
      try {
        const { user } = await meRequest();
        if (!cancelled) {
          setPermissions(user.permissions ?? []);
          setReady(true);
        }
      } catch {
        // Unauthenticated or network error — mark ready with empty perms.
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void fetchMe();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    permissions,
    ready,
    has: (key: string) => hasPermission(permissions, key),
    hasAny: (keys: string[]) => hasAny(permissions, keys),
  };
}
