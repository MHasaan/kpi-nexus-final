-- A task made by an automation now remembers which one ("workflowId"), so the
-- automation can see that its last task is still open and hold back instead of
-- making an identical one each time a value crosses its line.
-- Additive: one nullable column (no foreign key: scalar ids, org-scoped in
-- queries, like the task's other references) and an index for the look-up.
ALTER TABLE "Task" ADD COLUMN "workflowId" TEXT;
CREATE INDEX "Task_organizationId_workflowId_status_idx" ON "Task"("organizationId", "workflowId", "status");
