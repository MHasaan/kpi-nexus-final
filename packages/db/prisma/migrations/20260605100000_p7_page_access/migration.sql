-- Granular access Phase 7: Layer-5 page-access allow/deny lists (additive, nullable).
ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "pageAccess" JSONB;
ALTER TABLE "UserAccessOverride" ADD COLUMN IF NOT EXISTS "pageAccess" JSONB;
