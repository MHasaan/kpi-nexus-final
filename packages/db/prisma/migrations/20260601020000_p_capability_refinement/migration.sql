-- ADR-001 back-compat: any non-admin role holding the PARENT permission keeps the
-- carved-out CHILD keys, so no existing role loses access when endpoints/nav move to
-- the finer keys. Admins (isAdmin=true) implicitly have everything. Idempotent.
--   ORG_SETTINGS  -> AUDIT_VIEW, INTEGRATIONS_MANAGE, BILLING_MANAGE
--   REPORTS_VIEW  -> REPORTS_MANAGE, EXPORTS
--   ANALYTICS_VIEW-> ANALYTICS_FORECAST
--   KPI_CREATE    -> KPI_IMPORT
UPDATE "RoleDefinition"
SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions"
  || CASE WHEN 'ORG_SETTINGS'  = ANY("permissions") THEN ARRAY['AUDIT_VIEW','INTEGRATIONS_MANAGE','BILLING_MANAGE'] ELSE ARRAY[]::text[] END
  || CASE WHEN 'REPORTS_VIEW'   = ANY("permissions") THEN ARRAY['REPORTS_MANAGE','EXPORTS'] ELSE ARRAY[]::text[] END
  || CASE WHEN 'ANALYTICS_VIEW' = ANY("permissions") THEN ARRAY['ANALYTICS_FORECAST'] ELSE ARRAY[]::text[] END
  || CASE WHEN 'KPI_CREATE'     = ANY("permissions") THEN ARRAY['KPI_IMPORT'] ELSE ARRAY[]::text[] END
))
WHERE "isAdmin" = false;
