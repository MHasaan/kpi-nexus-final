import { DEFAULT_TERMINOLOGY, type Terminology } from './api-client';
import { pluralize } from './terminology-context';

/** Nav routes whose label follows an org-customisable term. */
const TERM_FOR_HREF: Record<string, { label: keyof Terminology; plural: keyof Terminology }> = {
  '/kpis': { label: 'kpiLabel', plural: 'kpiLabelPlural' },
  '/dashboards': { label: 'dashboardLabel', plural: 'dashboardLabelPlural' },
  '/roles': { label: 'roleLabel', plural: 'roleLabelPlural' },
  '/tasks': { label: 'taskLabel', plural: 'taskLabelPlural' },
  '/org-units': { label: 'groupLabel', plural: 'groupLabelPlural' },
};

/**
 * The nav label for `href`, following the org's custom terminology (FE-007:
 * the sidebar kept saying "Roles" after an org renamed roles). Only a label the
 * org actually customised replaces the nav's own default text, so the default
 * UI is unchanged.
 */
export function navLabelFor(href: string, defaultLabel: string, terminology: Terminology): string {
  const term = TERM_FOR_HREF[href];
  if (!term) return defaultLabel;
  const custom = terminology[term.label] as string | undefined;
  if (!custom || custom === DEFAULT_TERMINOLOGY[term.label]) return defaultLabel;
  return pluralize(custom, terminology[term.plural] as string | null | undefined);
}
