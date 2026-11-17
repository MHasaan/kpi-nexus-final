-- Forecast and what-if move from INSIGHTS_VIEW to ANALYTICS_FORECAST on the API
-- (UI-013, signed off 2026-11-17). Until now a role could use them with
-- ANALYTICS_VIEW (the pages' gate) plus INSIGHTS_VIEW (the API's gate).
-- Roles made after the 2026-06-01 capability migration — from the seed, an
-- organisation template or by hand — hold those two without the finer key and
-- would lose forecasting. Give it to exactly the roles that can forecast today,
-- so nobody loses it and nobody gains it. Admin roles hold everything already.
-- Idempotent.
UPDATE "RoleDefinition"
SET "permissions" = array_append("permissions", 'ANALYTICS_FORECAST')
WHERE "isAdmin" = false
  AND 'ANALYTICS_VIEW' = ANY("permissions")
  AND 'INSIGHTS_VIEW' = ANY("permissions")
  AND NOT ('ANALYTICS_FORECAST' = ANY("permissions"));
