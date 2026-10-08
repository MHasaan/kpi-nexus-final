-- OT-016: tenant tables whose organizationId had no foreign key in the
-- database used day to day.
--
-- Why idempotent: earlier migrations already create 33 of these 39 FKs (all
-- ON DELETE CASCADE), but schema.prisma never declared the relations, so any
-- database built with `prisma db push` (db:setup — dev, CI, the audit DB) has
-- none of them. Six are missing everywhere (KPIAssignmentOrgUnit,
-- KPIAssignmentUser, KPICascade, LoginAttempt, OnboardingSession,
-- OrgTemplate). schema.prisma now declares all 39, so `db push` creates them
-- too; this migration adds whichever are missing on a migrated database.
--
-- NOT VALID: the constraint (and its ON DELETE CASCADE) applies to every row
-- from now on, but existing rows are not checked, so this migration never
-- fails on — or deletes — legacy orphan rows. After cleaning orphans:
--   ALTER TABLE "<Table>" VALIDATE CONSTRAINT "<Table>_organizationId_fkey";
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AiBudget', 'AiCallLog', 'AiFeatureConfig', 'AiProvider', 'AnomalyDetection',
    'ApprovalRequest', 'ApprovalWorkflow', 'Comment', 'Connector', 'Forecast',
    'FormulaExpression', 'IngestionJob', 'IntegrationConnection',
    'KPIAssignmentOrgUnit', 'KPIAssignmentUser', 'KPIBenchmark', 'KPICascade',
    'KPIDependency', 'KPIInsight', 'KPITarget', 'KPITemplate', 'KPIThresholdBand',
    'KeyResult', 'KpiCatalogEmbedding', 'LineageEdge', 'LoginAttempt', 'Mention',
    'NLQQuery', 'Objective', 'OnboardingSession', 'OnboardingTask', 'OrgTemplate',
    'Pipeline', 'Plugin', 'Recommendation', 'ScimToken', 'SsoConfig', 'Task',
    'Workflow'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_organizationId_fkey'
        AND conrelid = format('%I', t)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId") '
        'REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID',
        t, t || '_organizationId_fkey'
      );
    END IF;
  END LOOP;
END $$;
