-- Row-Level Security (RLS) for tenant isolation — OT-014.
--
-- Layer 3 of the 3-layer defense (ALS context + Prisma filter + Postgres RLS).
-- Design: docs/superpowers/specs/2026-10-09-tenant-isolation-plan.md (option A).
--
-- Three database roles:
--   * kpi_nexus (owner) — owns the schema, runs migrations / seed. Not used by
--     the running API.
--   * kpi_app — every user request. Not the owner, NOBYPASSRLS, and there is NO
--     bypass policy, so it only ever sees the org in `app.current_org`, which
--     the API sets per transaction (set_config(..., true) — local to the
--     transaction, so a pooled connection cannot carry it to another request).
--   * kpi_system — background jobs and pre-login lookups (login, token / API-key
--     / SCIM / webhook lookups, platform admin). BYPASSRLS is a property of the
--     ROLE, so the request role cannot switch it on.
--
-- The old `app.bypass_rls` session variable is gone: any session could set it,
-- so it was not a security boundary.
--
-- Fail closed: no `app.current_org` ⇒ policies compare against NULL ⇒ no rows
-- visible and every write rejected by WITH CHECK.
--
-- Applied LAST by setup-db.mjs (after hypertables / continuous aggregates) so
-- KPIDataPoint's compression is already off and the rollup views exist.
-- Idempotent: safe to re-run via `pnpm db:setup`.

-- ============================================================================
-- Roles
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'kpi_app') THEN
    -- Dev-only password; setup-db.mjs replaces it from KPI_APP_DB_PASSWORD.
    CREATE ROLE kpi_app LOGIN PASSWORD 'app_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'kpi_system') THEN
    -- Dev-only password; setup-db.mjs replaces it from KPI_SYSTEM_DB_PASSWORD.
    CREATE ROLE kpi_system LOGIN PASSWORD 'system_password';
  END IF;
END
$$;

-- Pin the attributes every run, so a role that drifted is corrected.
ALTER ROLE kpi_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE kpi_system NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO kpi_app, kpi_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kpi_app, kpi_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kpi_app, kpi_system;
-- Future tables (created by later migrations as the owner) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kpi_app, kpi_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kpi_app, kpi_system;

-- The kpi_data_* continuous aggregates are materialized views — they cannot
-- carry RLS, and the API never reads them. The request role gets no access.
DO $$
DECLARE
  v text;
BEGIN
  FOR v IN
    SELECT view_name FROM timescaledb_information.continuous_aggregates
    WHERE view_schema = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM kpi_app', v);
  END LOOP;
END
$$;

-- ============================================================================
-- Tenant tables (every base table with an "organizationId" column): own org only
-- ----------------------------------------------------------------------------
-- Discovered from the catalog, so new tenant tables are covered on the next
-- `pnpm db:setup`. Includes KPIDataPoint (compression is off — hypertables.sql).
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
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_bypass ON %I', t);
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
-- Tables whose rule differs from the generic one
-- ============================================================================

-- Organization: the tenant root — a tenant sees only its own row, by id.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (id = current_setting('app.current_org', true))
  WITH CHECK (id = current_setting('app.current_org', true));

-- AuditLog / LoginAttempt: organizationId is NULL for platform-level events
-- (and failed logins for unknown emails). Tenants see their own rows only —
-- NULL rows are visible to kpi_system alone. A tenant request may still write a
-- NULL-org event (e.g. an audit row before the org is known).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditLog', 'LoginAttempt'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = current_setting(''app.current_org'', true))
         WITH CHECK (
           "organizationId" = current_setting(''app.current_org'', true)
           OR "organizationId" IS NULL
         )',
      t
    );
  END LOOP;
END
$$;

-- KPITemplate / OrgTemplate: organizationId NULL = built-in shared by every
-- tenant (readable by all); non-NULL = org-private. Tenants may only write
-- their own private templates — built-ins are managed by kpi_system.
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

-- OnboardingSession: NULL until the wizard creates the org. Drafts are read and
-- written pre-org by kpi_system (draft-token gated); once claimed, the generic
-- own-org rule above applies.

-- ============================================================================
-- Tables without organizationId — tenant-owned through a parent row
-- ----------------------------------------------------------------------------
-- Visible to a tenant only when the parent row belongs to the current org (the
-- parent tables are themselves RLS-protected, so the EXISTS is filtered too).
-- ============================================================================

-- Per-user tokens: RefreshToken, PasswordResetToken, EmailVerificationToken.
-- Mostly used before login (kpi_system); a tenant request sees only tokens of
-- users in its own org.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['RefreshToken', 'PasswordResetToken', 'EmailVerificationToken'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = %I."userId"
                        AND u."organizationId" = current_setting(''app.current_org'', true)))
         WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = %I."userId"
                        AND u."organizationId" = current_setting(''app.current_org'', true)))',
      t, t, t
    );
  END LOOP;
END
$$;

ALTER TABLE "KPIVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KPIVersion";
CREATE POLICY tenant_isolation ON "KPIVersion"
  USING (EXISTS (SELECT 1 FROM "KPI" k WHERE k.id = "KPIVersion"."kpiId"
                 AND k."organizationId" = current_setting('app.current_org', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "KPI" k WHERE k.id = "KPIVersion"."kpiId"
                 AND k."organizationId" = current_setting('app.current_org', true)));

ALTER TABLE "OrgUnitNameHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OrgUnitNameHistory";
CREATE POLICY tenant_isolation ON "OrgUnitNameHistory"
  USING (EXISTS (SELECT 1 FROM "OrgUnit" o WHERE o.id = "OrgUnitNameHistory"."orgUnitId"
                 AND o."organizationId" = current_setting('app.current_org', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "OrgUnit" o WHERE o.id = "OrgUnitNameHistory"."orgUnitId"
                 AND o."organizationId" = current_setting('app.current_org', true)));

ALTER TABLE "OnboardingAIInteraction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OnboardingAIInteraction";
CREATE POLICY tenant_isolation ON "OnboardingAIInteraction"
  USING (EXISTS (SELECT 1 FROM "OnboardingSession" s WHERE s.id = "OnboardingAIInteraction"."sessionId"
                 AND s."organizationId" = current_setting('app.current_org', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "OnboardingSession" s WHERE s.id = "OnboardingAIInteraction"."sessionId"
                 AND s."organizationId" = current_setting('app.current_org', true)));

-- PlatformAdmin: global operators — kpi_system only (no tenant policy ⇒ the
-- request role sees nothing and can write nothing).
ALTER TABLE "PlatformAdmin" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PlatformAdmin";

-- Plan: a public catalog — everyone may read it; only kpi_system writes it.
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_read ON "Plan";
CREATE POLICY plan_read ON "Plan" FOR SELECT USING (true);
