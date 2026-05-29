-- Manual migration: P2.x formula persistence + dependency DAG (build backlog,
-- calc-engine). Hand-written (TimescaleDB drift blocks prisma migrate dev).
-- Does not touch KPIDataPoint.

CREATE TABLE "FormulaExpression" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "kpiId"          TEXT         NOT NULL,
  "raw"            TEXT         NOT NULL,
  "ast"            JSONB        NOT NULL,
  "compiledSql"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormulaExpression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormulaExpression_kpiId_key"          ON "FormulaExpression"("kpiId");
CREATE INDEX        "FormulaExpression_organizationId_idx" ON "FormulaExpression"("organizationId");

ALTER TABLE "FormulaExpression"
  ADD CONSTRAINT "FormulaExpression_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "KPIDependency" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "sourceKpiId"    TEXT         NOT NULL,
  "dependentKpiId" TEXT         NOT NULL,
  "formulaRef"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KPIDependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KPIDependency_sourceKpiId_dependentKpiId_key"   ON "KPIDependency"("sourceKpiId", "dependentKpiId");
CREATE INDEX        "KPIDependency_organizationId_sourceKpiId_idx"   ON "KPIDependency"("organizationId", "sourceKpiId");
CREATE INDEX        "KPIDependency_organizationId_dependentKpiId_idx" ON "KPIDependency"("organizationId", "dependentKpiId");

ALTER TABLE "KPIDependency"
  ADD CONSTRAINT "KPIDependency_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
