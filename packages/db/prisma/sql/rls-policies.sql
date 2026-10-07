-- Row-Level Security (RLS) policies for tenant isolation.
--
-- Layer 3 of the 3-layer defense (ALS context + Prisma filter + Postgres RLS).
-- Policies read two GUCs:
--   * app.current_org — the tenant the session acts for
--   * app.bypass_rls  — 'true' for deliberate cross-tenant work
--     (RequestContextStore.runWithBypass(): login, token/credential lookups,
--     platform-admin ops, scheduled sweeps)
--
-- STATUS (audit OT-014): the policies cover every tenant table, but they are
-- NOT yet enforced at runtime. The API still connects as the table owner
-- (kpi_nexus), which RLS does not apply to, and nothing sets the GUCs per
-- query yet. Enforcement = connect the API as kpi_app (below) + a Prisma
-- extension that sets the GUCs from RequestContextStore + FORCE ROW LEVEL
-- SECURITY. Until then these policies are exercised by
-- apps/api/test/integration/rls-enforcement.spec.ts, which connects as kpi_app.
--
-- Coverage is discovered from the catalog, not hand-listed: every public base
-- table with an "organizationId" column gets RLS, so new tenant tables are
-- covered on the next `pnpm db:setup`. Exceptions are listed below.
--
-- Idempotent: safe to re-run via `pnpm db:setup`.

-- ============================================================================
-- Tenant tables: enable RLS + service-role bypass + tenant isolation
-- ----------------------------------------------------------------------------
-- Deliberately NOT covered:
--   * KPIDataPoint — a compressed TimescaleDB hypertable; TimescaleDB refuses
--     compression ("columnstore") on a table with row security. Its isolation
--     relies on the app-layer organizationId filter.
--   * The kpi_data_* continuous aggregates — materialized views can't carry RLS.
--   * Tables without an organizationId column (RefreshToken, the token tables,
--     OrgUnitNameHistory, KPIVersion, OnboardingAIInteraction, PlatformAdmin,
--     Plan) — tenant-owned only via a parent row, or global.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb USING (table_schema, table_name)
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organizationId'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> ALL (ARRAY['KPIDataPoint'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_bypass ON %I', t);
    EXECUTE format(
      'CREATE POLICY service_role_bypass ON %I
         USING (current_setting(''app.bypass_rls'', true) = ''true'')
         WITH CHECK (current_setting(''app.bypass_rls'', true) = ''true'')',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = current_setting(''app.current_org'', true))
         WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))',
      t
    );
  END LOOP;
END
$$;

-- ============================================================================
-- Tables whose isolation rule differs from the generic one
-- ============================================================================

-- Organization: the tenant root — tenants see only their own row, by id.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass ON "Organization";
CREATE POLICY service_role_bypass ON "Organization"
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = current_setting('app.current_org', true))
  WITH CHECK (id = current_setting('app.current_org', true));

-- AuditLog / LoginAttempt: organizationId is NULL for platform-level events
-- (and failed logins for unknown emails). Tenants see their own rows; NULL rows
-- are visible only under bypass; writes may be tenant-matched or NULL.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditLog', 'LoginAttempt'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (
           "organizationId" = current_setting(''app.current_org'', true)
           OR ("organizationId" IS NULL AND current_setting(''app.bypass_rls'', true) = ''true'')
         )
         WITH CHECK (
           "organizationId" = current_setting(''app.current_org'', true)
           OR "organizationId" IS NULL
         )',
      t
    );
  END LOOP;
END
$$;

-- KPITemplate / OrgTemplate: organizationId NULL = built-in template shared by
-- every tenant (readable by all); non-NULL = org-private. Tenants may only
-- write their own private templates — built-ins are managed under bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['KPITemplate', 'OrgTemplate'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" IS NULL OR "organizationId" = current_setting(''app.current_org'', true))
         WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))',
      t
    );
  END LOOP;
END
$$;

-- OnboardingSession: NULL until the wizard creates the org. Drafts are only
-- ever read/written pre-org under bypass (draft-token gated); once claimed the
-- generic rule (own org only) applies — no special policy needed.

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
