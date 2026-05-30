'use client';

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { type Locale, isRtl } from './dictionaries';
import { normalizeLocale, translate } from './translate';

const STORAGE_KEY = 'kpi-nexus.locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Applies dir + lang to <html> for the given locale. */
function applyDir(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en-US');

  useEffect(() => {
    const stored = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    setLocaleState(stored);
    applyDir(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
    // Cookie too, so a future server render can pick it up.
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    applyDir(l);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key: string) => translate(locale, key) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Outside a provider (e.g. unauthenticated pages): identity fallback.
    return { locale: 'en-US', setLocale: () => undefined, t: (key: string) => translate('en-US', key) };
  }
  return ctx;
}
