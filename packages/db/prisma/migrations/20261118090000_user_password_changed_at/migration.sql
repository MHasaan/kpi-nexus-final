-- When a person's password was last set (plan 6.5). The password policy's
-- "maximum age" was saved but never enforced, because nothing recorded this.
-- Additive: one nullable column.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Start the clock now for everyone who already has a password. Counting from
-- the account's creation instead would lock out, on the day this is deployed,
-- everyone in an organisation whose policy already names a maximum age.
-- People with no password (invited, or single sign-on only) keep NULL.
UPDATE "User" SET "passwordChangedAt" = CURRENT_TIMESTAMP WHERE "passwordHash" IS NOT NULL AND "passwordChangedAt" IS NULL;
