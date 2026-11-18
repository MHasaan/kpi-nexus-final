-- Personal notifications (plan 6.6). A delivery can now be addressed to one
-- person rather than a channel: "kind" says how (EMAIL), "targetUserId" who.
-- "held" says why a PENDING row has not gone yet: DIGEST (kept for the
-- person's digest) or MUTE_HOURS (waiting for their mute hours to end).
-- Additive: two nullable columns.
ALTER TABLE "NotificationDelivery" ADD COLUMN "kind" "NotificationChannelKind";
ALTER TABLE "NotificationDelivery" ADD COLUMN "held" TEXT;
CREATE INDEX "NotificationDelivery_status_held_idx" ON "NotificationDelivery"("status", "held");
