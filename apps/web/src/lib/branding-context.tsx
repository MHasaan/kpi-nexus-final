'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { brandColorProblem, brandTokens } from '@kpi-nexus/contracts';

import { getAccessToken, getMyOrganization } from './api-client';

/** What the organisation chose to look like. Null fields mean "the app's own". */
export interface Branding {
  name: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
}

const NONE: Branding = { name: null, logoUrl: null, faviconUrl: null, primaryColor: null };

const BrandingContext = createContext<{ branding: Branding; refresh: () => Promise<void> }>({ branding: NONE, refresh: async () => undefined });

const STYLE_ID = 'org-brand';
const FAVICON_ID = 'org-favicon';

/** Draw the app in the organisation's colour (or back in its own), in light and dark. */
function applyColor(color: string | null): void {
  const existing = document.getElementById(STYLE_ID);
  if (!color || brandColorProblem(color)) {
    existing?.remove();
    return;
  }
  const { light, dark } = brandTokens(color);
  const style = existing ?? Object.assign(document.createElement('style'), { id: STYLE_ID });
  style.textContent = `:root{--accent-primary:${light};--ring:${light};}.dark{--accent-primary:${dark};--ring:${dark};}`;
  if (!existing) document.head.appendChild(style);
}

/** Use the organisation's favicon (or go back to the app's). */
function applyFavicon(url: string | null): void {
  const existing = document.getElementById(FAVICON_ID);
  if (!url) {
    existing?.remove();
    return;
  }
  const link = (existing as HTMLLinkElement | null) ?? Object.assign(document.createElement('link'), { id: FAVICON_ID, rel: 'icon' });
  link.href = url;
  if (!existing) document.head.appendChild(link);
}

/**
 * Mounted once at the root. Reads the organisation's branding whenever the
 * signed-in session changes and applies it: the accent colour, the favicon,
 * and — through `useBranding()` — the name and logo in the sidebar.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(NONE);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setBranding(NONE);
      return;
    }
    try {
      const org = await getMyOrganization();
      setBranding({ name: org.name ?? null, logoUrl: org.logoUrl ?? null, faviconUrl: org.faviconUrl ?? null, primaryColor: org.primaryColor ?? null });
    } catch {
      // Not knowing the branding is no reason to change what is on screen.
    }
  }, []);

  const pathname = usePathname();
  const fetchedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const token = getAccessToken();
    if (token === fetchedFor.current) return;
    fetchedFor.current = token;
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    applyColor(branding.primaryColor);
    applyFavicon(branding.faviconUrl);
  }, [branding.primaryColor, branding.faviconUrl]);

  const value = useMemo(() => ({ branding, refresh }), [branding, refresh]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/** The organisation's branding, and a way to read it again after it is saved. */
export function useBranding(): { branding: Branding; refresh: () => Promise<void> } {
  return useContext(BrandingContext);
}
