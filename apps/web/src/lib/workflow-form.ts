import type { Workflow } from './collab-client';

/** The automation form: "when <KPI> <operator> <value>, create a task titled <title>". */
export interface WorkflowForm {
  name: string;
  kpiId: string;
  operator: string;
  value: string;
  taskTitle: string;
}

export const EMPTY_WORKFLOW_FORM: WorkflowForm = { name: '', kpiId: '', operator: '>', value: '', taskTitle: '' };

/** The comparisons the rule engine knows, with how each reads in a sentence. */
export const OPERATORS: ReadonlyArray<{ value: string; symbol: string; words: string }> = [
  { value: '>', symbol: '>', words: 'goes above' },
  { value: '>=', symbol: '≥', words: 'reaches or goes above' },
  { value: '<', symbol: '<', words: 'drops below' },
  { value: '<=', symbol: '≤', words: 'reaches or drops below' },
  { value: '==', symbol: '=', words: 'is exactly' },
  { value: '!=', symbol: '≠', words: 'is anything but' },
];

/** Why the form cannot be saved as it stands, or null. */
export function workflowFormProblem(form: WorkflowForm): string | null {
  if (form.name.trim().length < 2) return 'Give the automation a name.';
  if (!form.kpiId) return 'Choose the KPI to watch.';
  if (form.value.trim() === '' || !Number.isFinite(Number(form.value))) return 'Enter the number to compare the KPI with.';
  if (!form.taskTitle.trim()) return 'Give the task a title.';
  return null;
}

/** The request body for the form — the shapes the API's rule engine reads. */
export function workflowBody(form: WorkflowForm) {
  return {
    name: form.name.trim(),
    triggers: ['kpi_changed'],
    rule: { kind: 'kpi_value', kpiId: form.kpiId, operator: form.operator, value: Number(form.value) },
    action: { kind: 'create_task', title: form.taskTitle.trim() },
  };
}

type KpiValueRule = { kind: 'kpi_value'; kpiId: string; operator: string; value: number };
type CreateTaskAction = { kind: 'create_task'; title: string };

const isKpiValueRule = (rule: unknown): rule is KpiValueRule =>
  typeof rule === 'object' && rule !== null && (rule as { kind?: unknown }).kind === 'kpi_value';
const isCreateTask = (action: unknown): action is CreateTaskAction =>
  typeof action === 'object' && action !== null && (action as { kind?: unknown }).kind === 'create_task';

/** The form for an existing automation, or null when it is a kind this form cannot edit. */
export function formFromWorkflow(workflow: Workflow): WorkflowForm | null {
  if (!isKpiValueRule(workflow.rule) || !isCreateTask(workflow.action)) return null;
  return {
    name: workflow.name,
    kpiId: workflow.rule.kpiId,
    operator: workflow.rule.operator,
    value: String(workflow.rule.value),
    taskTitle: workflow.action.title,
  };
}

/** One automation as a sentence: "When Monthly Revenue goes above 100000, create the task “Celebrate”". */
export function describeWorkflow(workflow: Workflow, kpiName: (id: string) => string | undefined): string {
  const rule = workflow.rule as { kind?: string; kpiId?: string; operator?: string; value?: number; severity?: string } | null;
  const action = workflow.action as { kind?: string; title?: string; message?: string } | null;
  const op = (operator: string | undefined) => OPERATORS.find((o) => o.value === operator)?.words ?? operator ?? '?';

  let when: string;
  if (!rule) when = 'Every time it is triggered';
  else if (rule.kind === 'kpi_value') when = `When ${kpiName(rule.kpiId ?? '') ?? 'a KPI that no longer exists'} ${op(rule.operator)} ${rule.value}`;
  else if (rule.kind === 'kpi_change_pct') when = `When ${kpiName(rule.kpiId ?? '') ?? 'a KPI that no longer exists'} changes by a percentage that ${op(rule.operator)} ${rule.value}%`;
  else if (rule.kind === 'alert_severity') when = `When an alert’s severity ${op(rule.operator)} ${String(rule.severity).toLowerCase()}`;
  else when = 'When its condition is met';

  let then: string;
  if (action?.kind === 'create_task') then = `create the task “${action.title ?? ''}”`;
  else if (action?.kind === 'send_notification') then = 'send a notification';
  else if (action?.kind === 'post_webhook') then = 'call a webhook';
  else then = 'run its action';

  return `${when}, ${then}`;
}
