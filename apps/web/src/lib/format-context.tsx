'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import {
  DEFAULT_FORMAT_SETTINGS,
  type FormatSettings,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDay,
  formatNumber,
  formatSettingsOf,
} from '@kpi-nexus/contracts';

import { getAccessToken, getMyOrganization } from './api-client';

type DateInput = Date | string | number | null | undefined;

/** Dates and numbers written the way the organisation's settings say. */
export interface Formatters {
  /** The date of something that happened at a moment, in the organisation's timezone. */
  date: (value: DateInput) => string;
  /** Date and time of a moment, in the organisation's timezone. */
  dateTime: (value: DateInput) => string;
  /** A calendar day (a period's start or end) — never shifted by the timezone. */
  day: (value: DateInput) => string;
  number: (value: number | null | undefined, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
  currency: (value: number | null | undefined) => string;
  settings: FormatSettings;
  /** Read the settings again — call after saving them. */
  refresh: () => Promise<void>;
}

function build(settings: FormatSettings, refresh: () => Promise<void>): Formatters {
  return {
    date: (value) => formatDate(value, settings),
    dateTime: (value) => formatDateTime(value, settings),
    day: (value) => formatDay(value, settings),
    number: (value, options) => formatNumber(value, settings, options),
    currency: (value) => formatCurrency(value, settings),
    settings,
    refresh,
  };
}

const FormatContext = createContext<Formatters>(build(DEFAULT_FORMAT_SETTINGS, async () => undefined));

/**
 * Mounted once at the root. Reads the organisation's format settings whenever
 * the signed-in session changes, so every page writes dates and numbers the
 * same way — the way Settings says.
 */
export function FormatProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FormatSettings>(DEFAULT_FORMAT_SETTINGS);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setSettings(DEFAULT_FORMAT_SETTINGS);
      return;
    }
    try {
      setSettings(formatSettingsOf(await getMyOrganization()));
    } catch {
      // Not knowing the settings is no reason to hide a date: keep what is in use.
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

  const value = useMemo(() => build(settings, refresh), [settings, refresh]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

/** The organisation's formatters. Outside the provider: the defaults. */
export function useFormat(): Formatters {
  return useContext(FormatContext);
}
