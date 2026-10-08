/**
 * Demo-seed RBAC data (roles + inheritance), kept apart from seed.ts so
 * seed-roles.spec.ts can check it against the canonical contracts without a DB.
 *
 * Audit fixes:
 *  - BE-011: roles held permission keys that don't exist (TASKS_*, OBJECTIVES_*,
 *    ALERTS_MANAGE, AI_USE) — the API rejected re-saving a seeded role. Only
 *    canonical PermissionKey values are used now, and ALL_PERMISSIONS IS the
 *    canonical set (it had drifted both ways).
 *  - scopeConfig used a non-existent domain `OBJECTIVES` (ignored); it's `OKRS`.
 *  - BE-002: inheritance was wired org-chart style (Manager → Senior → Contributor)
 *    but the resolver means "child inherits parent's permissions", so
 *    Contributors received Department-Manager rights. See ROLE_INHERITANCE.
 */
import { PermissionKey } from '@kpi-nexus/contracts';

/** Every canonical permission key — the Administrator gets the full set. */
export const ALL_PERMISSIONS: readonly string[] = Object.values(PermissionKey);

// ---------------------------------------------------------------------------
// Roles (RBAC). A couple carry granular-access config to exercise the 5 layers.
// ---------------------------------------------------------------------------
export interface RoleSpec {
  name: string; isAdmin: boolean; level: number; color: string;
  permissions: readonly string[]; description: string;
  scopeConfig?: Record<string, string>;
  dataLimits?: { historyWindowDays?: number; maxListRows?: number; maxExportRows?: number };
  pageAccess?: { allow?: string[]; deny?: string[] };
}
export const ROLE_SPECS: RoleSpec[] = [
  {
    name: 'Administrator', isAdmin: true, level: 1, color: '#0284c7',
    permissions: ALL_PERMISSIONS, description: 'Full access to everything in the organization.',
  },
  {
    name: 'Executive', isAdmin: false, level: 2, color: '#7c3aed',
    description: 'Org-wide read access plus dashboards and analytics; no destructive admin.',
    permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
    scopeConfig: { KPIS: 'ORG', DASHBOARDS: 'ORG', OKRS: 'ORG', TASKS: 'ORG', ALERTS: 'ORG', REPORTS: 'ORG' },
  },
  {
    name: 'Department Manager', isAdmin: false, level: 3, color: '#0891b2',
    description: 'Manages KPIs, dashboards and people within their department.',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'UNITS', TASKS: 'UNITS', OKRS: 'UNITS', ALERTS: 'UNITS' },
  },
  {
    name: 'Senior Contributor', isAdmin: false, level: 4, color: '#059669',
    description: 'Experienced IC who can create and edit KPIs and enter data.',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'SELF', TASKS: 'SELF' },
  },
  {
    name: 'Analyst', isAdmin: false, level: 4, color: '#d97706',
    description: 'Enters data and builds analytics, with a 180-day history window.',
    permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'UNITS' },
    dataLimits: { historyWindowDays: 180, maxListRows: 500, maxExportRows: 5000 },
  },
  {
    name: 'Contributor', isAdmin: false, level: 5, color: '#475569',
    description: 'Records their own KPI data and sees team dashboards.',
    permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW'],
    scopeConfig: { KPIS: 'SELF', DASHBOARDS: 'SELF', TASKS: 'SELF' },
    dataLimits: { historyWindowDays: 90, maxListRows: 200, maxExportRows: 1000 },
  },
  {
    name: 'Viewer', isAdmin: false, level: 6, color: '#94a3b8',
    description: 'Read-only access to KPIs and dashboards; settings pages hidden.',
    permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'],
    scopeConfig: { KPIS: 'SELF', DASHBOARDS: 'SELF' },
    pageAccess: { deny: ['/settings', '/settings/access', '/roles', '/users'] },
  },
];

/**
 * Role inheritance edges. The resolver applies them as "CHILD inherits the
 * PARENT's permissions", so a more senior role inherits from a more junior one
 * (never the reverse). Each child already holds its parent's permissions, so
 * effective permissions equal the declared ones — seed-roles.spec.ts enforces it.
 */
export const ROLE_INHERITANCE: ReadonlyArray<{ parent: string; child: string; inheritsPermissions: boolean }> = [
  { parent: 'Viewer', child: 'Contributor', inheritsPermissions: true },
  { parent: 'Contributor', child: 'Senior Contributor', inheritsPermissions: true },
  { parent: 'Senior Contributor', child: 'Department Manager', inheritsPermissions: true },
];
