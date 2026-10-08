import type { PermissionKey } from '@kpi-nexus/contracts';

/**
 * The role-editor permission matrix (FE-002): all 25 canonical permissions in
 * display groups. A spec asserts this covers ALL_PERMISSIONS exactly, so a new
 * key can't silently go missing from the editor again (7 did: ADR-001's
 * KPI_IMPORT … BILLING_MANAGE).
 */
export const PERMISSION_GROUPS: ReadonlyArray<{
  group: string;
  permissions: ReadonlyArray<{ key: PermissionKey; label: string }>;
}> = [
  {
    group: 'KPIs',
    permissions: [
      { key: 'KPI_VIEW', label: 'View' },
      { key: 'KPI_CREATE', label: 'Create' },
      { key: 'KPI_EDIT', label: 'Edit' },
      { key: 'KPI_DELETE', label: 'Delete' },
      { key: 'KPI_DATA_ENTRY', label: 'Data entry' },
      { key: 'KPI_IMPORT', label: 'Bulk import' },
    ],
  },
  {
    group: 'Dashboards',
    permissions: [
      { key: 'DASHBOARD_VIEW', label: 'View' },
      { key: 'DASHBOARD_MANAGE', label: 'Manage' },
    ],
  },
  {
    group: 'Users & RBAC',
    permissions: [
      { key: 'USERS_VIEW', label: 'Users view' },
      { key: 'USERS_MANAGE', label: 'Users manage' },
      { key: 'ROLES_MANAGE', label: 'Roles manage' },
    ],
  },
  {
    group: 'Org',
    permissions: [
      { key: 'POSITIONS_MANAGE', label: 'Positions' },
      { key: 'GROUPS_VIEW', label: 'Groups view' },
      { key: 'GROUPS_MANAGE', label: 'Groups manage' },
    ],
  },
  {
    group: 'Intelligence',
    permissions: [
      { key: 'ALERTS_VIEW', label: 'Alerts' },
      { key: 'INSIGHTS_VIEW', label: 'Insights' },
      { key: 'ANALYTICS_VIEW', label: 'Analytics' },
      { key: 'ANALYTICS_FORECAST', label: 'Forecast & what-if' },
      { key: 'REPORTS_VIEW', label: 'Reports view' },
      { key: 'REPORTS_MANAGE', label: 'Reports manage' },
      { key: 'EXPORTS', label: 'Exports' },
    ],
  },
  {
    group: 'Admin',
    permissions: [
      { key: 'ORG_SETTINGS', label: 'Org settings' },
      { key: 'AUDIT_VIEW', label: 'Audit log' },
      { key: 'INTEGRATIONS_MANAGE', label: 'Integrations' },
      { key: 'BILLING_MANAGE', label: 'Billing' },
    ],
  },
];

/**
 * How one checkbox in the matrix behaves. Mirrors the API's escalation guard:
 * an editor may remove any permission but only ADD ones they hold themselves;
 * admin roles bypass every check, so their matrix is fully granted and locked.
 */
export function permissionToggleState(args: {
  roleIsAdmin: boolean;
  checked: boolean;
  key: string;
  callerHas: (key: string) => boolean;
}): { checked: boolean; disabled: boolean; reason?: string } {
  if (args.roleIsAdmin) return { checked: true, disabled: true, reason: 'Admin roles hold every permission' };
  if (!args.checked && !args.callerHas(args.key)) {
    return { checked: false, disabled: true, reason: "You can't grant a permission you don't hold" };
  }
  return { checked: args.checked, disabled: false };
}

/** The 202 body the API returns when a change was queued for approval instead of applied. */
export function isApprovalPending(body: unknown): body is { code: 'APPROVAL_REQUIRED'; requestId: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'APPROVAL_REQUIRED'
  );
}
