-- Row-Level Security (RLS) policies for tenant isolation.
--
-- Layer 3 of the 3-layer defense (ALS context + Prisma filter + Postgres RLS).
-- The api sets `app.current_org` via `SET LOCAL` on every connection checkout
-- (see Prisma middleware in packages/db/src/index.ts — wired in P1's
-- TenancyModule task).
--
-- The `app.bypass_rls` GUC is honored for:
--   * migrations (Prisma runs as superuser-equivalent during db push)
--   * platform-admin ops via `RequestContextStore.runWithBypass()`
--
-- Idempotent: safe to re-run via `pnpm db:setup`.

-- ============================================================================
-- Enable RLS on every tenant-scoped table
-- ============================================================================

ALTER TABLE "Organization"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomDomain"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleDefinition"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleInheritance"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PermissionDelegation"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourcePermission"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgUnitDimension"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgUnitType"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgUnit"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgUnitMember"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantQuota"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostMetric"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionPolicy"        ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Service-role bypass — for migrations and platform-admin ops
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Organization','User','CustomDomain','RoleDefinition','RoleInheritance',
    'Position','PermissionDelegation','ResourcePermission',
    'OrgUnitDimension','OrgUnitType','OrgUnit','OrgUnitMember',
    'AuditLog','TenantQuota','FeatureFlag','CostMetric','RetentionPolicy'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS service_role_bypass ON %I',
      t
    );
    EXECUTE format(
      'CREATE POLICY service_role_bypass ON %I
         USING (current_setting(''app.bypass_rls'', true) = ''true'')
         WITH CHECK (current_setting(''app.bypass_rls'', true) = ''true'')',
      t
    );
  END LOOP;
END
$$;

-- ============================================================================
-- Tenant isolation policies
-- ============================================================================

-- Organization: tenants see only their own row by id
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = current_setting('app.current_org', true))
  WITH CHECK (id = current_setting('app.current_org', true));

-- All other tenant-scoped tables filter by organizationId column
DO $$
DECLARE
  t text;
  org_scoped_tables text[] := ARRAY[
    'User','CustomDomain','RoleDefinition','RoleInheritance',
    'Position','PermissionDelegation','ResourcePermission',
    'OrgUnitDimension','OrgUnitType','OrgUnit','OrgUnitMember',
    'TenantQuota','FeatureFlag','CostMetric','RetentionPolicy'
  ];
BEGIN
  FOREACH t IN ARRAY org_scoped_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON %I',
      t
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = current_setting(''app.current_org'', true))
         WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))',
      t
    );
  END LOOP;
END
$$;

-- AuditLog allows NULL organizationId for platform-admin cross-tenant ops.
-- Visible to tenant when organizationId matches; NULL rows visible only under
-- bypass; writes allow either tenant-match or NULL organizationId.
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    "organizationId" = current_setting('app.current_org', true)
    OR ("organizationId" IS NULL AND current_setting('app.bypass_rls', true) = 'true')
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_org', true)
    OR "organizationId" IS NULL
  );
