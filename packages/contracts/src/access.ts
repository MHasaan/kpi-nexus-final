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
 * Layer-2 configuration carried on a role (later a per-user override): a partial
 * per-domain scope map. An unset domain falls back to the derived default
 * (`UNITS` for non-admins). Stored as JSON on `RoleDefinition.scopeConfig`.
 */
export const ScopeConfigSchema = z.record(DomainSchema, ScopeSchema);
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

/** Layer 4 — how much / how old (null = unlimited). */
export const DataLimitsSchema = z.object({
  historyWindowDays: z.number().int().positive().nullable(),
  maxListRows: z.number().int().positive().nullable(),
  maxExportRows: z.number().int().positive().nullable(),
});
export type DataLimits = z.infer<typeof DataLimitsSchema>;

/**
 * Layer-4 role configuration (Phase 4) — partial data limits stored on
 * `RoleDefinition.dataLimits`. An unset/null field ⇒ unlimited (parity); admins
 * bypass. Enforced at user-facing KPI data reads (history clamp + row/export caps).
 */
export const DataLimitsConfigSchema = DataLimitsSchema.partial();
export type DataLimitsConfig = z.infer<typeof DataLimitsConfigSchema>;

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
  scopeByDomain: z.record(DomainSchema, ScopeSchema),
  dataTypeFilters: DataTypeFiltersSchema,
  dataLimits: DataLimitsSchema,
  context: AccessMembershipSchema,
});
export type AccessProfile = z.infer<typeof AccessProfileSchema>;
