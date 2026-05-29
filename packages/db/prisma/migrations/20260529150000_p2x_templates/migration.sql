-- Manual migration: P2.x KPI templates (build backlog). Hand-written
-- (TimescaleDB drift blocks prisma migrate dev). Reuses existing PG enum types
-- ("KPIType", "KPIDirection", "KPIFrequency", "AggregationMethod"). There is no
-- ScorecardQuadrant enum in this schema — quadrant is a free string. Does not
-- touch KPIDataPoint.

CREATE TABLE "KPITemplate" (
  "id"                TEXT                NOT NULL,
  "organizationId"    TEXT,
  "slug"              TEXT                NOT NULL,
  "name"              TEXT                NOT NULL,
  "description"       TEXT,
  "type"              "KPIType"           NOT NULL,
  "direction"         "KPIDirection"      NOT NULL,
  "frequency"         "KPIFrequency"      NOT NULL,
  "aggregationMethod" "AggregationMethod",
  "scorecardQuadrant" TEXT,
  "function"          TEXT,
  "industry"          TEXT,
  "unit"              TEXT,
  "unitConfig"        JSONB,
  "targetSummary"     TEXT,
  "tags"              TEXT[]              NOT NULL DEFAULT ARRAY[]::TEXT[],
  "popularity"        INTEGER             NOT NULL DEFAULT 0,
  "isGlobal"          BOOLEAN             NOT NULL DEFAULT false,
  "isBuiltin"         BOOLEAN             NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KPITemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KPITemplate_slug_key"              ON "KPITemplate"("slug");
CREATE INDEX        "KPITemplate_function_idx"          ON "KPITemplate"("function");
CREATE INDEX        "KPITemplate_scorecardQuadrant_idx" ON "KPITemplate"("scorecardQuadrant");
CREATE INDEX        "KPITemplate_industry_idx"          ON "KPITemplate"("industry");
CREATE INDEX        "KPITemplate_popularity_idx"        ON "KPITemplate"("popularity" DESC);

ALTER TABLE "KPITemplate"
  ADD CONSTRAINT "KPITemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
