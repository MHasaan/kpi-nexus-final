-- "Week starts on" is about to take effect (plan 6.4). Until now it was saved
-- and ignored: every week in the app ran Monday to Sunday, while the column
-- defaulted to 0 (Sunday). So that nothing shifts on the day this is deployed,
-- organisations still on 0 are set to Monday — the behaviour they have had all
-- along — and Monday becomes the default for new organisations. An
-- organisation that wants Sunday weeks chooses it on the Fiscal calendar page,
-- and from then on it is honoured.
ALTER TABLE "Organization" ALTER COLUMN "weekStartsOn" SET DEFAULT 1;
UPDATE "Organization" SET "weekStartsOn" = 1 WHERE "weekStartsOn" = 0;
