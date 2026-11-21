-- An organisation's AI calls are capped by number per day as well as by spend: the free
-- Gemini tier records no cost, so the dollar caps never triggered and a busy day could use
-- the provider's whole free quota (F-045). Additive: one column with a default of 300.
ALTER TABLE "AiBudget" ADD COLUMN "dailyCallCap" INTEGER NOT NULL DEFAULT 300;
