-- Manual migration: P2.x add scorecardQuadrant to KPI (BSC scorecard grid).
-- Hand-written (TimescaleDB drift blocks prisma migrate dev). Free string:
-- FINANCIAL | CUSTOMER | INTERNAL_PROCESS | LEARNING_GROWTH.

ALTER TABLE "KPI" ADD COLUMN "scorecardQuadrant" TEXT;
