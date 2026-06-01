'use client';

import { useEffect, useState } from 'react';

import type { AccessProfile, Domain, Scope } from '@kpi-nexus/contracts';

import { meRequest } from './api-client';
import { getCachedAccessProfile, scopeAtLeast, scopeForDomain } from './access';

export interface UseAccessResult {
  /** The resolved access profile for the current user (null until ready). */
  profile: AccessProfile | null;
  /** True once we have resolved the profile (from cache or the API). */
  ready: boolean;
  /** The effective "whose data" scope for a domain (admins ⇒ ORG). */
  scopeFor: (domain: Domain) => Scope;
  /** True when the domain scope is at least as wide as `required`. */
  scopeAtLeast: (domain: Domain, required: Scope) => boolean;
}

/**
 * Hook that provides the current user's resolved {@link AccessProfile} — the
 * "whose data / how much / what type" layer that complements `usePermissions`'
 * can-do-X checks.
 *
 * SSR-safe in the same way as `usePermissions`: starts at `null` / `ready:false`
 * so the server render and the client's first render agree, then hydrates from
 * the localStorage cache after mount, falling back to a single `meRequest()`.
 */
export function useAccess(): UseAccessResult {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const cached = getCachedAccessProfile();
    if (cached) {
      setProfile(cached);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    async function fetchMe() {
      try {
        const { accessProfile } = await meRequest();
        if (!cancelled) {
          setProfile(accessProfile ?? null);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    }

    void fetchMe();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    profile,
    ready,
    scopeFor: (domain: Domain) => scopeForDomain(profile, domain),
    scopeAtLeast: (domain: Domain, required: Scope) => scopeAtLeast(profile, domain, required),
  };
}
