-- Granular access Phase 2: per-role per-domain scope configuration.
-- Additive + nullable ⇒ existing roles unaffected (null ⇒ derived default = parity).
ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "scopeConfig" jsonb;
