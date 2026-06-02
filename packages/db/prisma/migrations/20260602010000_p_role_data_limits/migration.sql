-- Granular access Phase 4: per-role data limits (historyWindowDays / maxListRows / maxExportRows).
-- Additive + nullable ⇒ existing roles unaffected (null ⇒ unlimited = parity).
ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "dataLimits" jsonb;
