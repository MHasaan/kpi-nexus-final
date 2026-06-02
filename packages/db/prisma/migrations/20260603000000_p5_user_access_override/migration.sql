-- Granular access Phase 5: per-user access override (one row per user).
-- New additive table; existing data unaffected. Idempotent guards for safe re-run.
CREATE TABLE IF NOT EXISTS "UserAccessOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revokeCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeConfig" JSONB,
    "dataTypeConfig" JSONB,
    "dataLimits" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAccessOverride_organizationId_userId_key" ON "UserAccessOverride"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "UserAccessOverride_organizationId_idx" ON "UserAccessOverride"("organizationId");

DO $$ BEGIN
  ALTER TABLE "UserAccessOverride" ADD CONSTRAINT "UserAccessOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserAccessOverride" ADD CONSTRAINT "UserAccessOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
