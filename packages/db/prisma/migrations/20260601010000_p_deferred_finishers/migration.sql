-- Remaining deferred-item fields. All additive + defaulted/nullable — safe on existing rows.

-- 1. Insight confidence (derived 0..1).
ALTER TABLE "KPIInsight" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- 2. Approval before→after diff: snapshot of the pre-change entity state.
ALTER TABLE "ApprovalRequest" ADD COLUMN IF NOT EXISTS "currentPayload" JSONB;

-- 3. Embed-token revoke: bump to invalidate all previously-minted embed tokens for a KPI.
ALTER TABLE "KPI" ADD COLUMN IF NOT EXISTS "embedTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- 4. Org terminology plural overrides (null → auto-pluralize the singular label).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "roleLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "groupLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "memberLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "kpiLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "dashboardLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "scorecardLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "objectiveLabelPlural" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "taskLabelPlural" TEXT;
