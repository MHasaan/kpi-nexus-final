import { PermissionKey } from '@kpi-nexus/contracts';

/**
 * The four default roles seeded into every new organization. Admin uses the
 * `isAdmin` bypass so its `permissions[]` is empty; the other three are
 * derived from spec §5.3 and the module-permission map in §5.7.
 *
 * `level` is a monotonic display-order field (admin highest); `color` is the
 * hint shown in role chips in the UI.
 */
export interface DefaultRoleSeed {
  name: string;
  description: string;
  isAdmin: boolean;
  level: number;
  color: string;
  permissions: readonly PermissionKey[];
}

export const DEFAULT_ROLES: readonly DefaultRoleSeed[] = [
  {
    name: 'Admin',
    description: 'Full access to everything in the organization.',
    isAdmin: true,
    level: 100,
    color: '#dc2626',
    permissions: [],
  },
  {
    name: 'Manager',
    description: 'Manages a team — can edit KPIs, dashboards, and see team data.',
    isAdmin: false,
    level: 70,
    color: '#2563eb',
    permissions: [
      PermissionKey.KPI_VIEW,
      PermissionKey.KPI_CREATE,
      PermissionKey.KPI_EDIT,
      PermissionKey.KPI_DATA_ENTRY,
      PermissionKey.DASHBOARD_VIEW,
      PermissionKey.DASHBOARD_MANAGE,
      PermissionKey.USERS_VIEW,
      PermissionKey.GROUPS_VIEW,
      PermissionKey.ALERTS_VIEW,
      PermissionKey.REPORTS_VIEW,
      PermissionKey.ANALYTICS_VIEW,
      PermissionKey.INSIGHTS_VIEW,
    ],
  },
  {
    name: 'Employee',
    description: 'Records data, sees org-wide KPIs and assigned dashboards.',
    isAdmin: false,
    level: 30,
    color: '#16a34a',
    permissions: [
      PermissionKey.KPI_VIEW,
      PermissionKey.KPI_DATA_ENTRY,
      PermissionKey.DASHBOARD_VIEW,
      PermissionKey.ALERTS_VIEW,
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to KPIs, dashboards, and reports.',
    isAdmin: false,
    level: 10,
    color: '#737373',
    permissions: [
      PermissionKey.KPI_VIEW,
      PermissionKey.DASHBOARD_VIEW,
      PermissionKey.REPORTS_VIEW,
    ],
  },
];
