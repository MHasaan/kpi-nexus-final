-- Manual migration: P5 ML persistence — anomaly detections + forecasts.
--
-- Hand-written (same convention as the other P5 migrations). Does not touch the
-- KPIDataPoint hypertable.

-- Enum ------------------------------------------------------------------------

CREATE TYPE "ForecastModelKind" AS ENUM ('PROPHET', 'ARIMA', 'NAIVE', 'LSTM');

-- AnomalyDetection ------------------------------------------------------------

CREATE TABLE "AnomalyDetection" (
  "id"             TEXT             NOT NULL,
  "organizationId" TEXT             NOT NULL,
  "kpiId"          TEXT             NOT NULL,
  "dataPointId"    TEXT,
  "score"          DOUBLE PRECISION NOT NULL,
  "method"         TEXT             NOT NULL,
  "isConfirmed"    BOOLEAN          NOT NULL DEFAULT false,
  "detectedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnomalyDetection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnomalyDetection_organizationId_idx"     ON "AnomalyDetection"("organizationId");
CREATE INDEX "AnomalyDetection_kpiId_detectedAt_idx"   ON "AnomalyDetection"("kpiId", "detectedAt");
CREATE INDEX "AnomalyDetection_kpiId_isConfirmed_idx"  ON "AnomalyDetection"("kpiId", "isConfirmed");

ALTER TABLE "AnomalyDetection"
  ADD CONSTRAINT "AnomalyDetection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Forecast --------------------------------------------------------------------

CREATE TABLE "Forecast" (
  "id"             TEXT                NOT NULL,
  "organizationId" TEXT                NOT NULL,
  "kpiId"          TEXT                NOT NULL,
  "horizon"        INTEGER             NOT NULL,
  "model"          "ForecastModelKind" NOT NULL,
  "predictions"    JSONB               NOT NULL,
  "fitMetrics"     JSONB,
  "generatedAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Forecast_organizationId_kpiId_generatedAt_idx" ON "Forecast"("organizationId", "kpiId", "generatedAt");

ALTER TABLE "Forecast"
  ADD CONSTRAINT "Forecast_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
