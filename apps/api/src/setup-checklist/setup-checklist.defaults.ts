/**
 * Pure setup-checklist defaults + merge logic. Kept free of Prisma/Nest so the
 * lazy-default behaviour is unit-testable. A fresh org sees all 14 tasks as
 * `pending` without any rows persisted; only a status change persists a row.
 * What the organisation has really done is laid over that (`resolveChecklist`).
 */

export type ChecklistStatus = 'pending' | 'complete' | 'dismissed';

export interface ChecklistTaskDef {
  key: string;
  category: string;
  label: string;
  /** The page where this is done. */
  href: string;
}

export interface ChecklistItem extends ChecklistTaskDef {
  status: ChecklistStatus;
  /** Complete because the work itself exists (a channel, an invite, …), not because someone ticked it. */
  detected: boolean;
}

/**
 * In the order a new organisation gets to them: people, data, what they look
 * at, what tells them when something is wrong, then the administrative rest.
 * Keys are stored on OnboardingTask rows — rename a label freely, never a key.
 */
export const DEFAULT_TASKS: ChecklistTaskDef[] = [
  { key: 'remaining_invites', category: 'Team', label: 'Invite your team', href: '/users' },
  { key: 'historical_import', category: 'Data', label: 'Record or import KPI values', href: '/kpis/import' },
  { key: 'default_dashboard', category: 'Dashboards', label: 'Add widgets to a dashboard', href: '/dashboards' },
  { key: 'channels', category: 'Alerts', label: 'Add a notification channel', href: '/alerts/channels' },
  { key: 'escalation', category: 'Alerts', label: 'Decide who is told when an alert is ignored', href: '/alerts/rules' },
  { key: 'scheduled_report', category: 'Reports', label: 'Schedule a report', href: '/reports' },
  { key: 'okrs', category: 'OKRs', label: 'Create your first objective', href: '/okrs' },
  { key: 'data_source', category: 'Data', label: 'Connect a data source', href: '/integrations' },
  { key: 'mfa', category: 'Security', label: 'Turn on two-step sign-in for administrators', href: '/profile' },
  { key: 'sso', category: 'Security', label: 'Set up single sign-on', href: '/settings/sso' },
  { key: 'ai_tuning', category: 'AI', label: 'Review AI settings', href: '/settings/ai' },
  { key: 'custom_domain', category: 'Setup', label: 'Add your own domain', href: '/settings/custom-domain' },
  { key: 'domain_verification', category: 'Setup', label: 'Verify your domain', href: '/settings/custom-domain' },
  { key: 'compliance_review', category: 'Compliance', label: 'Review data retention and audit settings', href: '/settings/retention' },
];

const VALID_KEYS = new Set(DEFAULT_TASKS.map((t) => t.key));

export function isValidTaskKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

/**
 * The checklist as it stands: each task's stored status, overlaid with what the
 * organisation has actually done. A task whose work exists is complete without
 * anyone ticking it; a task someone dismissed stays dismissed.
 */
export function resolveChecklist(
  persisted: Array<{ key: string; status: string }>,
  detected: ReadonlySet<string>,
): ChecklistItem[] {
  const byKey = new Map(persisted.filter((p) => VALID_KEYS.has(p.key)).map((p) => [p.key, p.status]));
  return DEFAULT_TASKS.map((t) => {
    const stored = (byKey.get(t.key) as ChecklistStatus | undefined) ?? 'pending';
    const isDetected = stored !== 'dismissed' && detected.has(t.key);
    return { ...t, status: isDetected ? 'complete' : stored, detected: isDetected };
  });
}

/** Overlay persisted statuses onto the 14 defaults (unknown keys ignored). */
export function mergeChecklist(persisted: Array<{ key: string; status: string }>): ChecklistItem[] {
  return resolveChecklist(persisted, new Set());
}

export function countComplete(items: ChecklistItem[]): number {
  return items.filter((i) => i.status === 'complete').length;
}
