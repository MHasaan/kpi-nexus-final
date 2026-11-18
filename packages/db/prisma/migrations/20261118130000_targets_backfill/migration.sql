-- One-off backfill for UI-017 (owner's decision, 2026-11-18).
--
-- From now on the target in effect on a KPI's Targets tab is the KPI's target:
-- the API writes its figure to "KPI"."targetValue" whenever a target is added,
-- changed or deleted, and hourly for targets that start or end on their own.
-- Targets saved before that were never applied. This applies them once.
--
-- The rule is the one in apps/api/src/kpi-targets/kpi-target-sync.service.ts:
--   * only fixed, dated and tiered targets count (a tiered one gives its
--     expected value); scenario, formula and conditional targets never do;
--   * the target's dates must hold now;
--   * a dated start outranks an open-ended one, a later start an earlier one,
--     and between equals the newest wins.
-- A KPI with no target in effect is not touched: it keeps the target it has.
-- Deleted KPIs are not touched. Each KPI that changes gets an audit row with
-- the old and new figure. Running this twice changes nothing the second time.
WITH in_effect AS (
  SELECT DISTINCT ON (t."kpiId")
    t."kpiId",
    t."organizationId",
    t."id" AS "targetId",
    CASE WHEN t."type" = 'TIERED' THEN COALESCE(t."expectedValue", t."value") ELSE t."value" END AS "figure"
  FROM "KPITarget" t
  WHERE t."type" IN ('STATIC', 'TIME_VARYING', 'TIERED')
    AND (CASE WHEN t."type" = 'TIERED' THEN COALESCE(t."expectedValue", t."value") ELSE t."value" END) IS NOT NULL
    AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= now())
    AND (t."effectiveTo" IS NULL OR t."effectiveTo" >= now())
  ORDER BY t."kpiId", t."effectiveFrom" DESC NULLS LAST, t."createdAt" DESC
),
before AS (
  SELECT k."id", k."targetValue" AS "previous"
  FROM "KPI" k
  JOIN in_effect e ON e."kpiId" = k."id"
),
changed AS (
  UPDATE "KPI" k
  SET "targetValue" = e."figure", "updatedAt" = now()
  FROM in_effect e
  WHERE k."id" = e."kpiId"
    AND k."organizationId" = e."organizationId"
    AND k."deletedAt" IS NULL
    AND k."targetValue" IS DISTINCT FROM e."figure"
  RETURNING k."id", k."organizationId", e."figure", e."targetId"
)
INSERT INTO "AuditLog" ("id", "organizationId", "action", "entityType", "entityId", "metadata", "redactedKeys", "createdAt")
SELECT
  'bf' || md5(random()::text || c."id"),
  c."organizationId",
  'UPDATE',
  'KPI',
  c."id",
  jsonb_build_object(
    'targetValue', c."figure",
    'previousTargetValue', b."previous",
    'fromTargetId', c."targetId",
    'source', 'targets-backfill'
  ),
  ARRAY[]::text[],
  now()
FROM changed c
JOIN before b ON b."id" = c."id";
