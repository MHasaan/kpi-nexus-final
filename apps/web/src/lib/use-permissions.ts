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
 * - Reads the localStorage cache synchronously on first render so guard
 *   components don't flash incorrectly (SSR-safe via `typeof window`).
 * - If the cache is empty, fires `meRequest()` once to populate it.
 * - On SSR (no window), returns `ready: false` and an empty permissions array
 *   so the server render is always safe.
 */
export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<string[]>(() => {
    // Synchronous initializer — works on client; returns [] on server.
    return getCachedPermissions();
  });
  const [ready, setReady] = useState<boolean>(() => {
    // If the cache already has entries we are ready immediately.
    return getCachedPermissions().length > 0;
  });

  useEffect(() => {
    // Already hydrated from cache — nothing to do.
    if (ready) return;

    let cancelled = false;

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
    return () => { cancelled = true; };
  }, [ready]);

  return {
    permissions,
    ready,
    has: (key: string) => hasPermission(permissions, key),
    hasAny: (keys: string[]) => hasAny(permissions, keys),
  };
}
