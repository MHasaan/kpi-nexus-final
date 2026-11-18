/**
 * Contextual help registry — maps pathname patterns to short tips shown in the
 * floating help drawer. Keep tips under ~100 chars each; 2-4 per route.
 */

import { ALL_PERMISSIONS } from '@kpi-nexus/contracts';

export interface HelpEntry {
  title: string;
  tips: string[];
}

const DEFAULT: HelpEntry = {
  title: 'KPI Nexus Help',
  tips: [
    'Use the menu on the left to move between pages; it lists only what your role may open.',
    'The search box at the top finds KPIs, dashboards and people.',
    'The bell at the top lists alerts that have fired.',
  ],
};

/**
 * Registry: exact or prefix pathname → help content.
 * Entries are tried longest-match-first inside helpForPath.
 *
 * Every tip must describe something the app really has (QA-L14): name a
 * control only by the words on it, and change the tip when the page changes.
 */
const CONTEXTUAL_HELP: Record<string, HelpEntry> = {
  '/dashboard': {
    title: 'Dashboard tips',
    tips: [
      'This page shows how your KPIs stand now and which of them need attention.',
      'Open a KPI from here to see its history, targets and thresholds.',
      'For charts you arrange yourself, use Dashboards in the menu on the left.',
    ],
  },
  '/dashboards': {
    title: 'Dashboards tips',
    tips: [
      'Make a dashboard for a team or a purpose, then add widgets to it in edit mode.',
      'In edit mode, drag a widget to move it and pull its corner to resize it.',
      'A dashboard can be shared with people outside by a public link.',
    ],
  },
  '/kpis': {
    title: 'KPI tips',
    tips: [
      'A KPI is organisation-wide, per unit or per person; that decides who records its values.',
      'Thresholds and bands decide the status shown beside a value.',
      'A formula works a KPI out from other KPIs; a cascade rolls child KPIs up into a parent.',
      'Filter the list by category, status or scope to find a KPI quickly.',
    ],
  },
  '/alerts': {
    title: 'Alerts tips',
    tips: [
      'A rule watches one KPI and raises an alert when its condition is met.',
      'A rule can escalate to someone else when nobody acknowledges the alert in time.',
      'Acknowledge an alert to show that someone is dealing with it.',
    ],
  },
  '/roles': {
    title: 'Roles & permissions tips',
    tips: [
      `Roles bundle the ${ALL_PERMISSIONS.length} permissions — assign one role per user.`,
      'Changes to a role take effect on the user\'s next page load.',
    ],
  },
  '/org-units': {
    title: 'Teams (org-units) tips',
    tips: [
      'Org units mirror your structure and can sit inside one another.',
      'A per-unit KPI is recorded once for each unit it is assigned to.',
      'Moving a unit takes the units under it along.',
    ],
  },
  '/users': {
    title: 'Members tips',
    tips: [
      'Invite members by email — they receive a link to set their password.',
      'Change a member\'s role here; the new permissions apply on their next page load.',
      'Suspending a member stops them signing in and keeps their data.',
    ],
  },
  '/settings': {
    title: 'Settings tips',
    tips: [
      'Organisation settings cover branding, date and number formats, and the fiscal calendar.',
      'API keys let other tools send data in; replace them from time to time.',
      'Webhooks send events to an address you choose.',
    ],
  },
  '/okrs': {
    title: 'OKRs tips',
    tips: [
      'A key result can be linked to a KPI and takes its value; "Sync from linked KPIs" brings in newer values.',
      'Every objective has an owner and a period.',
      'An objective\'s progress is worked out from its key results.',
    ],
  },
  '/ask': {
    title: 'AI assistant tips',
    tips: [
      'Ask in plain words — for example "Which KPIs are below target this quarter?"',
      'AI use has a daily and a monthly budget; an administrator sets them in Settings.',
    ],
  },
  '/profile': {
    title: 'Profile tips',
    tips: [
      'The name you set here is how others see you.',
      'Choose your language, time zone and which notifications reach you.',
    ],
  },
};

/**
 * Returns the help entry for the given pathname.
 *
 * Matching strategy (in priority order):
 * 1. Exact match (e.g. /dashboard → /dashboard entry).
 * 2. Longest-prefix match (e.g. /kpis/abc-123 → /kpis entry).
 * 3. DEFAULT if nothing matches.
 */
export function helpForPath(pathname: string): HelpEntry {
  if (Object.prototype.hasOwnProperty.call(CONTEXTUAL_HELP, pathname)) {
    return CONTEXTUAL_HELP[pathname]!;
  }

  // Find the longest registered key that is a prefix of pathname.
  let best: string | null = null;
  for (const key of Object.keys(CONTEXTUAL_HELP)) {
    if (pathname.startsWith(`${key}/`)) {
      if (best === null || key.length > best.length) {
        best = key;
      }
    }
  }

  return best !== null ? CONTEXTUAL_HELP[best]! : DEFAULT;
}

export { CONTEXTUAL_HELP, DEFAULT as HELP_DEFAULT };
