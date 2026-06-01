import { z } from 'zod';

/**
 * Canonical permissions for KPI Nexus — 18 core (spec §5.2) + 7 refined (ADR-001,
 * 2026-06-01: docs/superpowers/specs/2026-06-01-granular-access-control-design.md).
 *
 * Adding or removing a permission requires an ADR plus coordinated updates
 * across: RBAC module, role seeders, frontend guards, and this enum.
 *
 * Admin bypass (RoleDefinition.isAdmin = true) grants all of these implicitly.
 */
export const PermissionKey = {
  // KPIs (5)
  KPI_VIEW: 'KPI_VIEW',
  KPI_CREATE: 'KPI_CREATE',
  KPI_EDIT: 'KPI_EDIT',
  KPI_DELETE: 'KPI_DELETE',
  KPI_DATA_ENTRY: 'KPI_DATA_ENTRY',

  // Dashboards (2)
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  DASHBOARD_MANAGE: 'DASHBOARD_MANAGE',

  // Users & RBAC (4)
  USERS_VIEW: 'USERS_VIEW',
  USERS_MANAGE: 'USERS_MANAGE',
  ROLES_MANAGE: 'ROLES_MANAGE',
  POSITIONS_MANAGE: 'POSITIONS_MANAGE',

  // Org structure (2)
  GROUPS_VIEW: 'GROUPS_VIEW',
  GROUPS_MANAGE: 'GROUPS_MANAGE',

  // Alerts (1)
  ALERTS_VIEW: 'ALERTS_VIEW',

  // Insights (3)
  REPORTS_VIEW: 'REPORTS_VIEW',
  ANALYTICS_VIEW: 'ANALYTICS_VIEW',
  INSIGHTS_VIEW: 'INSIGHTS_VIEW',

  // Admin — covers retention, AI config, API keys, SSO, SCIM, custom domain (1)
  ORG_SETTINGS: 'ORG_SETTINGS',

  // Refined capabilities (ADR-001, 2026-06-01) — carved out for finer assignment.
  KPI_IMPORT: 'KPI_IMPORT', // bulk CSV import (was implied by KPI_CREATE)
  REPORTS_MANAGE: 'REPORTS_MANAGE', // create/schedule/trigger reports (was REPORTS_VIEW)
  ANALYTICS_FORECAST: 'ANALYTICS_FORECAST', // forecast / what-if (subset of ANALYTICS_VIEW)
  EXPORTS: 'EXPORTS', // download/export data in any format
  AUDIT_VIEW: 'AUDIT_VIEW', // read the audit log (carved from ORG_SETTINGS)
  INTEGRATIONS_MANAGE: 'INTEGRATIONS_MANAGE', // connectors/webhooks/integrations (carved from ORG_SETTINGS)
  BILLING_MANAGE: 'BILLING_MANAGE', // billing (carved from ORG_SETTINGS)
} as const;

export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

export const PermissionKeySchema = z.nativeEnum(PermissionKey);

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PermissionKey);

export const PERMISSION_COUNT = 25 as const;
