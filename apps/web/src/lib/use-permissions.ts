'use client';

import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, meRequest } from './api-client';
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
  /**
   * False when there is no session (no token, or the API answered 401). Guards
   * must send such users to sign in, not to "/unauthorized" (FE-009).
   */
  authenticated: boolean;
  /**
   * True when the permissions could not be fetched for a reason other than a
   * missing session (the server or the network failed). The person is signed
   * in and nothing is known about what they may open: say so and offer
   * `retry`, rather than treating them as someone with no permissions.
   */
  failed: boolean;
  /** Ask again after `failed`. */
  retry: () => void;
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
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // No session at all: resolved, unauthenticated (cached permissions from a
    // previous session must not count).
    if (!getAccessToken()) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    // Hydrate from the synchronous cache first (no flash beyond the first paint).
    const cached = getCachedPermissions();
    if (cached.length > 0) {
      setPermissions(cached);
      setAuthenticated(true);
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
          setAuthenticated(true);
          setReady(true);
        }
      } catch (err) {
        // 401 ⇒ the session is gone. Any other failure (the server or the
        // network) says nothing about what this person may open: signed in,
        // permissions unknown — reported as `failed`, not as "no permissions".
        if (!cancelled) {
          const signedOut = err instanceof ApiError && err.status === 401;
          setAuthenticated(!signedOut);
          setFailed(!signedOut);
          setReady(true);
        }
      }
    }

    void fetchMe();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    permissions,
    ready,
    authenticated,
    failed,
    retry: () => {
      setFailed(false);
      setReady(false);
      setAttempt((n) => n + 1);
    },
    has: (key: string) => hasPermission(permissions, key),
    hasAny: (keys: string[]) => hasAny(permissions, keys),
  };
}
