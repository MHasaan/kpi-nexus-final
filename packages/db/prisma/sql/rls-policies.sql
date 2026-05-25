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

-- ============================================================================
-- Non-owner application role (kpi_app)
-- ----------------------------------------------------------------------------
-- The Postgres role that OWNS the tables (kpi_nexus, created by docker-compose)
-- bypasses RLS by default — `ENABLE ROW LEVEL SECURITY` only applies to
-- non-owner sessions. To make RLS enforce against real application traffic we
-- need a second role that the API connects as in production.
--
-- For P1 this role is provisioned and proven correct via the
-- rls-enforcement.spec.ts integration test (connects as kpi_app, asserts that
-- queries without `app.current_org` return 0 rows). The runtime API still
-- connects as kpi_nexus owner today; switching it (DATABASE_URL → kpi_app +
-- Prisma $extends GUC setter) is a follow-up commit that doesn't affect the
-- correctness of the policies themselves.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'kpi_app') THEN
    -- Password is dev-only — production uses a secret-managed credential
    -- and overrides via the APP_DATABASE_URL env var.
    CREATE ROLE kpi_app LOGIN PASSWORD 'app_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO kpi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kpi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kpi_app;

-- Future tables (created by subsequent prisma migrations as the owner) inherit
-- the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kpi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kpi_app;
