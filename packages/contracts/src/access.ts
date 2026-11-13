import { z } from 'zod';

import { PermissionKeySchema } from './permissions.js';

/**
 * Granular access model (spec: 2026-06-01-granular-access-control-design.md).
 *
 * A user's effective access resolves to an {@link AccessProfile} with five
 * layers. Phase 1 ships at behavioural parity: scope is the derived default and
 * data-type/limits are unrestricted (null); later phases make them configurable.
 */

/** Feature domains used for per-domain scope + page mapping. */
export const DomainSchema = z.enum([
  'KPIS',
  'DASHBOARDS',
  'ALERTS',
  'REPORTS',
  'ANALYTICS',
  'INSIGHTS',
  'OKRS',
  'TASKS',
  'PEOPLE',
  'ORG',
]);
export type Domain = z.infer<typeof DomainSchema>;

/** "Whose data" — ORG ⊃ UNITS ⊃ DIRECT_REPORTS ⊃ SELF. Admin implies ORG. */
export const ScopeSchema = z.enum(['SELF', 'DIRECT_REPORTS', 'UNITS', 'ORG']);
export type Scope = z.infer<typeof ScopeSchema>;

/**
 * Per-domain non-admin default scope when neither the role nor a user override
 * sets one. Each value reproduces that domain's behaviour from before scopes
 * were enforced: KPIS=UNITS, DASHBOARDS/TASKS=SELF, OKRS/REPORTS/ALERTS=ORG.
 * PEOPLE / ORG / ANALYTICS are ORG (everyone could see every person, unit and
 * analytics on any visible KPI) so enforcing them (BE-004) changes nothing until
 * an admin narrows them. Shared so the role editor can show the real default.
 */
export const DOMAIN_DEFAULT_SCOPE: Record<Domain, Scope> = {
  KPIS: 'UNITS',
  DASHBOARDS: 'SELF',
  ALERTS: 'ORG',
  REPORTS: 'ORG',
  ANALYTICS: 'ORG',
  INSIGHTS: 'UNITS',
  OKRS: 'ORG',
  TASKS: 'SELF',
  PEOPLE: 'ORG',
  ORG: 'ORG',
};

/** Canonical verbs for ResourcePermission grants (Phase 3.5). */
export const ResourceActionSchema = z.enum(['view', 'edit', 'delete', 'data_entry', 'manage']);
export type ResourceAction = z.infer<typeof ResourceActionSchema>;

/**
 * A resolved per-entity grant (Phase 3.5) the principal holds — a row from
 * `ResourcePermission` flattened into the profile. Consumers (e.g. DashboardsService)
 * OR the granted ids into their visibility predicate so a granted resource surfaces
 * even when the principal's domain scope wouldn't show it.
 */
export const ResourceGrantSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  action: ResourceActionSchema,
});
export type ResourceGrant = z.infer<typeof ResourceGrantSchema>;

/**
 * Layer-2 configuration carried on a role (later a per-user override): a partial
 * per-domain scope map. An unset domain falls back to the derived default
 * (`UNITS` for non-admins). Stored as JSON on `RoleDefinition.scopeConfig`.
 */
export const ScopeConfigSchema = z.partialRecord(DomainSchema, ScopeSchema);
export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;

/** Layer 3 — restrict to specific data types (null = all; [] = none; [ids] = only). */
export const DataTypeFiltersSchema = z.object({
  kpiCategoryIds: z.array(z.string()).nullable(),
  orgUnitIds: z.array(z.string()).nullable(),
  dashboardIds: z.array(z.string()).nullable(),
});
export type DataTypeFilters = z.infer<typeof DataTypeFiltersSchema>;

/**
 * Layer-3 role configuration — which data *types* a role may see. Phase 3 enforces
 * `kpiCategoryIds` only (null/absent = all categories ⇒ parity; [] = none; [ids] =
 * only those). `orgUnitIds`/`dashboardIds` enforcement is a later refinement.
 */
export const DataTypeConfigSchema = z.object({
  kpiCategoryIds: z.array(z.string()).nullable().optional(),
});
export type DataTypeConfig = z.infer<typeof DataTypeConfigSchema>;

/** Layer 4 — how much / how old (null = unlimited). Upper bounds keep an absurd
 *  config from overflowing date math / unbounded queries. */
export const DataLimitsSchema = z.object({
  historyWindowDays: z.number().int().positive().max(36500).nullable(), // ≤ ~100 years
  maxListRows: z.number().int().positive().max(1_000_000).nullable(),
  maxExportRows: z.number().int().positive().max(10_000_000).nullable(),
});
export type DataLimits = z.infer<typeof DataLimitsSchema>;

/**
 * Layer-4 role configuration (Phase 4) — partial data limits stored on
 * `RoleDefinition.dataLimits`. An unset/null field ⇒ unlimited (parity); admins
 * bypass. Enforced at user-facing KPI data reads (history clamp + row/export caps).
 */
export const DataLimitsConfigSchema = DataLimitsSchema.partial();
export type DataLimitsConfig = z.infer<typeof DataLimitsConfigSchema>;

/**
 * Phase 7 — Layer-5 page access. `allow` (null/absent ⇒ no allowlist) and `deny`
 * lists of route/page keys, stored on a role (and overridable per-user). Default/
 * admin ⇒ `{ allow: null, deny: [] }` (no restriction).
 */
export const PageAccessConfigSchema = z.object({
  allow: z.array(z.string()).nullable().optional(),
  deny: z.array(z.string()).optional(),
});
export type PageAccessConfig = z.infer<typeof PageAccessConfigSchema>;

export const PageAccessSchema = z.object({
  allow: z.array(z.string()).nullable(),
  deny: z.array(z.string()),
});
export type PageAccess = z.infer<typeof PageAccessSchema>;

/**
 * Phase 5 — per-user override on top of the role. `grant`/`revokeCapabilities` are
 * capability deltas (revoke wins, applied in the resolver so the guard honours them);
 * scope/dataType/limits REPLACE the role value per-field when set. Unset ⇒ role value
 * ⇒ parity; admins are immune. Stored on `UserAccessOverride`.
 */
export const UserAccessOverrideSchema = z.object({
  grantCapabilities: z.array(PermissionKeySchema).default([]),
  revokeCapabilities: z.array(PermissionKeySchema).default([]),
  scopeConfig: ScopeConfigSchema.optional(),
  dataTypeConfig: DataTypeConfigSchema.optional(),
  dataLimits: DataLimitsConfigSchema.optional(),
  pageAccess: PageAccessConfigSchema.optional(),
});
export type UserAccessOverride = z.infer<typeof UserAccessOverrideSchema>;

/** Derived membership context (Phase 1) consumed by the FE + later phases. */
export const AccessMembershipSchema = z.object({
  managedOrgUnitIds: z.array(z.string()),
  memberOrgUnitIds: z.array(z.string()),
  directReportIds: z.array(z.string()),
});
export type AccessMembership = z.infer<typeof AccessMembershipSchema>;

export const AccessProfileSchema = z.object({
  isAdmin: z.boolean(),
  capabilities: z.array(PermissionKeySchema),
  scopeByDomain: z.partialRecord(DomainSchema, ScopeSchema),
  dataTypeFilters: DataTypeFiltersSchema,
  dataLimits: DataLimitsSchema,
  context: AccessMembershipSchema,
  resourceGrants: z.array(ResourceGrantSchema),
  pageAccess: PageAccessSchema,
});
export type AccessProfile = z.infer<typeof AccessProfileSchema>;
