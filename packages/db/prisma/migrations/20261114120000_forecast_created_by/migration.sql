-- Who generated a stored forecast (BE-034). A caller whose analytics point
-- scope is restricted lists only the forecasts they generated; rows from
-- before this column (NULL) are hidden from them.

-- AlterTable
ALTER TABLE "Forecast" ADD COLUMN "createdById" TEXT;
