'use client';

import { useEffect, useState } from 'react';

import { DEFAULT_FISCAL_CONFIG, type FiscalConfig, fiscalConfigOf } from '@kpi-nexus/contracts';

import { getAccessToken, getMyOrganization } from './api-client';

// One request per signed-in session, shared by every component that asks.
let cached: { token: string; config: Promise<FiscalConfig> } | null = null;

function load(token: string): Promise<FiscalConfig> {
  if (cached?.token !== token) {
    cached = {
      token,
      config: getMyOrganization().then(fiscalConfigOf, () => {
        // Not knowing the calendar is not a reason to block a form: use the default, and ask again next time.
        cached = null;
        return DEFAULT_FISCAL_CONFIG;
      }),
    };
  }
  return cached.config;
}

/** Forget the calendar — call after saving the fiscal settings, so the next reader gets the new one. */
export function forgetFiscalConfig(): void {
  cached = null;
}

/**
 * The organisation's calendar (fiscal year start, first day of the week).
 * `ready` is false until it is known; `config` is the default until then.
 */
export function useFiscalConfig(): { config: FiscalConfig; ready: boolean } {
  const [state, setState] = useState<{ config: FiscalConfig; ready: boolean }>({ config: DEFAULT_FISCAL_CONFIG, ready: false });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setState({ config: DEFAULT_FISCAL_CONFIG, ready: true });
      return;
    }
    let active = true;
    void load(token).then((config) => {
      if (active) setState({ config, ready: true });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
