-- Retention purging (plan 6.7). A policy purges only after an administrator
-- turns purging on for it: "purgeEnabledAt" is NULL for every existing policy,
-- so policies saved while the setting did nothing (and the seeded ones) stay
-- off. Owner's decision, 2026-11-18. Additive: two nullable columns.
ALTER TABLE "RetentionPolicy" ADD COLUMN "purgeEnabledAt" TIMESTAMP(3);
ALTER TABLE "RetentionPolicy" ADD COLUMN "lastRunDeleted" INTEGER;
