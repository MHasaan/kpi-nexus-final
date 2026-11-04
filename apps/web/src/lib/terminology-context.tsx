'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

import {
  DEFAULT_TERMINOLOGY,
  getAccessToken,
  getTerminology,
  type Terminology,
} from './api-client';

interface TerminologyContextValue {
  terminology: Terminology;
  loading: boolean;
  /** Refresh from the server — call after a PATCH that changes labels. */
  refresh: () => Promise<void>;
}

const TerminologyContext = createContext<TerminologyContextValue>({
  terminology: DEFAULT_TERMINOLOGY,
  loading: false,
  refresh: async () => undefined,
});

/**
 * Wrap any authenticated page subtree to expose the org's custom labels
 * via `useTerminology()`. Fetches on mount if there's an access token;
 * otherwise yields defaults so unauthenticated paths don't crash.
 */
export function TerminologyProvider({ children }: { children: ReactNode }) {
  const [terminology, setTerminology] = useState<Terminology>(DEFAULT_TERMINOLOGY);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setTerminology(DEFAULT_TERMINOLOGY);
      return;
    }
    setLoading(true);
    try {
      const data = await getTerminology();
      setTerminology(data);
    } catch {
      setTerminology(DEFAULT_TERMINOLOGY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mounted once at the root, which persists across client-side navigation —
  // so refetch whenever the signed-in session changes (login, logout, switch),
  // not just on mount (a fetch on /login would otherwise stick to defaults).
  const pathname = usePathname();
  const fetchedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const token = getAccessToken();
    if (token === fetchedFor.current) return;
    fetchedFor.current = token;
    void refresh();
  }, [pathname, refresh]);

  const value = useMemo(
    () => ({ terminology, loading, refresh }),
    [terminology, loading, refresh],
  );

  return (
    <TerminologyContext.Provider value={value}>
      {children}
    </TerminologyContext.Provider>
  );
}

export function useTerminology(): TerminologyContextValue {
  return useContext(TerminologyContext);
}

/**
 * Pluralization heuristic — handles the common "y → ies" + "default + s"
 * cases. The api stores singular labels; the FE pluralizes for list
 * headings and nav. Spec §4 calls for "smart pluralization".
 *
 * If a non-empty `override` is supplied (the org's custom plural label),
 * it is returned verbatim and the heuristic is skipped. Existing one-arg
 * callers are unaffected.
 */
export function pluralize(label: string, override?: string | null): string {
  if (override && override.trim().length > 0) {
    return override;
  }
  if (!label) return label;
  if (/y$/i.test(label) && !/[aeiou]y$/i.test(label)) {
    return `${label.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(label)) {
    return `${label}es`;
  }
  return `${label}s`;
}
