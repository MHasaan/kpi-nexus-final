-- KPIInsight dismiss/lifecycle: allow operators to dismiss an AI insight so it
-- no longer surfaces in the active list. Additive, nullable/defaulted columns —
-- safe on existing rows.
ALTER TABLE "KPIInsight" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "KPIInsight" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
ALTER TABLE "KPIInsight" ADD COLUMN IF NOT EXISTS "dismissedById" TEXT;

CREATE INDEX IF NOT EXISTS "KPIInsight_organizationId_status_idx" ON "KPIInsight" ("organizationId", "status");
