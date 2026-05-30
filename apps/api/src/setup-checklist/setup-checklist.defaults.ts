/**
 * Pure setup-checklist defaults + merge logic. Kept free of Prisma/Nest so the
 * lazy-default behaviour is unit-testable. A fresh org sees all 14 tasks as
 * `pending` without any rows persisted; only a status change persists a row.
 */

export type ChecklistStatus = 'pending' | 'complete' | 'dismissed';

export interface ChecklistTaskDef {
  key: string;
  category: string;
  label: string;
}

export interface ChecklistItem extends ChecklistTaskDef {
  status: ChecklistStatus;
}

export const DEFAULT_TASKS: ChecklistTaskDef[] = [
  { key: 'domain_verification', category: 'Setup', label: 'Verify custom domain' },
  { key: 'sso', category: 'Security', label: 'Set up SSO (SAML/OIDC)' },
  { key: 'mfa', category: 'Security', label: 'Enable MFA for admins' },
  { key: 'data_source', category: 'Data', label: 'Connect a data source' },
  { key: 'channels', category: 'Alerts', label: 'Configure notification channels' },
  { key: 'historical_import', category: 'Data', label: 'Import historical KPI data' },
  { key: 'default_dashboard', category: 'Dashboards', label: 'Customize default dashboard' },
  { key: 'scheduled_report', category: 'Reports', label: 'Set up a scheduled report' },
  { key: 'ai_tuning', category: 'AI', label: 'Tune AI provider settings' },
  { key: 'remaining_invites', category: 'Team', label: 'Invite remaining team members' },
  { key: 'okrs', category: 'OKRs', label: 'Create your first OKR (post-P7)' },
  { key: 'escalation', category: 'Alerts', label: 'Configure alert escalation policies' },
  { key: 'custom_domain', category: 'Setup', label: 'Add custom domain' },
  { key: 'compliance_review', category: 'Compliance', label: 'Review compliance settings' },
];

const VALID_KEYS = new Set(DEFAULT_TASKS.map((t) => t.key));

export function isValidTaskKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

/** Overlay persisted statuses onto the 14 defaults (unknown keys ignored). */
export function mergeChecklist(persisted: Array<{ key: string; status: string }>): ChecklistItem[] {
  const byKey = new Map(persisted.filter((p) => VALID_KEYS.has(p.key)).map((p) => [p.key, p.status]));
  return DEFAULT_TASKS.map((t) => ({
    ...t,
    status: (byKey.get(t.key) as ChecklistStatus) ?? 'pending',
  }));
}

export function countComplete(items: ChecklistItem[]): number {
  return items.filter((i) => i.status === 'complete').length;
}
