-- Scheduled reports move from ORG_SETTINGS to REPORTS_MANAGE on the API
-- (UI-013, signed off 2026-11-17). Until now REPORTS_MANAGE gated nothing, yet
-- many roles hold it: the 2026-06-01 capability migration gave it to every
-- role that had REPORTS_VIEW, and the default Manager role lists it. Left as
-- it is, all of those would start being able to create, pause and delete
-- scheduled reports — which email data to addresses the creator types.
-- Keep the key only where reports can be managed today (the role also holds
-- ORG_SETTINGS), so nobody gains it by this change; an administrator grants
-- it from the Roles page from now on. Admin roles hold everything already.
-- Idempotent.
UPDATE "RoleDefinition"
SET "permissions" = array_remove("permissions", 'REPORTS_MANAGE')
WHERE "isAdmin" = false
  AND 'REPORTS_MANAGE' = ANY("permissions")
  AND NOT ('ORG_SETTINGS' = ANY("permissions"));
