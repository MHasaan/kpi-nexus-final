-- Granular access Phase 3: per-role data-type (KPI category) allowlist.
-- Additive + nullable ⇒ existing roles unaffected (null ⇒ all categories = parity).
ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "dataTypeConfig" jsonb;
