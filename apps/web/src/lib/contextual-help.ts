/**
 * Contextual help registry — maps pathname patterns to short tips shown in the
 * floating help drawer. Keep tips under ~100 chars each; 2-4 per route.
 */

export interface HelpEntry {
  title: string;
  tips: string[];
}

const DEFAULT: HelpEntry = {
  title: 'KPI Nexus Help',
  tips: [
    'Navigate to any page using the top nav bar.',
    'Use the search icon (⌕) to find KPIs, dashboards, or teammates fast.',
    'Click your profile link to update your personal details and preferences.',
  ],
};

/**
 * Registry: exact or prefix pathname → help content.
 * Entries are tried longest-match-first inside helpForPath.
 */
const CONTEXTUAL_HELP: Record<string, HelpEntry> = {
  '/dashboard': {
    title: 'Dashboard tips',
    tips: [
      'Your Dashboard shows a live snapshot of KPIs you own or follow.',
      'Pin a KPI widget by opening the KPI and clicking "Add to dashboard".',
      'Alert badges here link directly to the triggered rule so you can act fast.',
    ],
  },
  '/dashboards': {
    title: 'Dashboards tips',
    tips: [
      'Create a dashboard per team or use-case; share a public link to any.',
      'Drag widgets to re-order; resize them using the corner handle.',
      'Real-time SSE keeps every chart current — no manual refresh needed.',
    ],
  },
  '/kpis': {
    title: 'KPI tips',
    tips: [
      'Set a formula to auto-calculate the value from child KPIs or raw data.',
      'Thresholds (green/amber/red bands) drive the status badge and alerts.',
      'Use the "Cascade" button to push a KPI target down to sub-units.',
      'Filter by category or owner to find the KPI you need quickly.',
    ],
  },
  '/alerts': {
    title: 'Alerts tips',
    tips: [
      'An alert rule fires whenever a threshold band is breached.',
      'Escalation chains let you notify a manager if the first responder is quiet.',
      'Silence a rule for a fixed window (e.g. scheduled maintenance) via Snooze.',
    ],
  },
  '/roles': {
    title: 'Roles & permissions tips',
    tips: [
      'Roles bundle the 18 canonical permissions — assign one role per user.',
      'Use the "Duplicate" button to clone an existing role before editing.',
      'Changes to a role take effect on the user\'s next page load.',
    ],
  },
  '/org-units': {
    title: 'Teams (org-units) tips',
    tips: [
      'Org-units map your company hierarchy — create as many levels as you need.',
      'Assign KPIs at the unit level to track team performance separately.',
      'Moving a unit re-parents all its children and members automatically.',
    ],
  },
  '/users': {
    title: 'Members tips',
    tips: [
      'Invite members by email — they receive a link to set their password.',
      'Change a member\'s role here; the new permissions apply immediately.',
      'Offboarding a member suspends their access without deleting their data.',
    ],
  },
  '/settings': {
    title: 'Settings tips',
    tips: [
      'Organization settings control branding, locale, and fiscal-year start.',
      'API keys let external tools push data; rotate them regularly.',
      'Webhook endpoints receive real-time event payloads for KPI changes.',
    ],
  },
  '/okrs': {
    title: 'OKRs tips',
    tips: [
      'Link an Objective to one or more KPIs to measure key results automatically.',
      'Set a due date and owner so accountability is clear.',
      'Progress rolls up from child KRs — keep each KR binary or percentage-based.',
    ],
  },
  '/ask': {
    title: 'AI assistant tips',
    tips: [
      'Ask in plain English — e.g. "Which KPIs are trending down this quarter?"',
      'Prefix with /chart to get an inline chart with your answer.',
      'The AI budget resets monthly; your admin can raise the cap in Settings.',
    ],
  },
  '/profile': {
    title: 'Profile tips',
    tips: [
      'Update your display name and avatar so teammates can recognise you.',
      'Set your notification preferences to reduce alert noise.',
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
    if (pathname.startsWith(`${key}/`) || pathname.startsWith(key)) {
      if (best === null || key.length > best.length) {
        best = key;
      }
    }
  }

  return best !== null ? CONTEXTUAL_HELP[best]! : DEFAULT;
}

export { CONTEXTUAL_HELP, DEFAULT as HELP_DEFAULT };
