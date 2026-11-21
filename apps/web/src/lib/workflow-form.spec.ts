import { describe, expect, test } from 'vitest';

import type { Workflow } from './collab-client';
import { EMPTY_WORKFLOW_FORM, OPERATORS, describeWorkflow, formFromWorkflow, workflowBody, workflowFormProblem } from './workflow-form';

const form = {
  ...EMPTY_WORKFLOW_FORM, name: 'Celebrate big MRR', kpiId: 'kpi-1', operator: '>', value: '100000', taskTitle: ' Celebrate! ' };
const workflow = (extra: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Celebrate big MRR',
  description: null,
  triggers: ['kpi_changed'],
  rule: { kind: 'kpi_value', kpiId: 'kpi-1', operator: '>', value: 100000 },
  action: { kind: 'create_task', title: 'Celebrate!' },
  isActive: true,
  lastRunAt: null,
  ...extra,
});
const names = (id: string) => (id === 'kpi-1' ? 'Monthly Revenue' : undefined);

describe('workflowBody', () => {
  test('sends what the rule engine reads — not the names the page used to make up (UI-007)', () => {
    expect(workflowBody(form)).toEqual({
      name: 'Celebrate big MRR',
      triggers: ['kpi_changed'],
      rule: { kind: 'kpi_value', kpiId: 'kpi-1', operator: '>', value: 100000 },
      action: { kind: 'create_task', title: 'Celebrate!' },
    });
  });

  test('every operator offered is one the engine knows', () => {
    expect(OPERATORS.map((o) => o.value)).toEqual(['>', '>=', '<', '<=', '==', '!=']);
  });
});

describe('workflowFormProblem', () => {
  test('a complete form is fine; zero and negatives are numbers', () => {
    expect(workflowFormProblem(form)).toBeNull();
    expect(workflowFormProblem({ ...form, value: '0' })).toBeNull();
    expect(workflowFormProblem({ ...form, value: '-5.5' })).toBeNull();
  });

  test('says the first thing that is missing', () => {
    expect(workflowFormProblem(EMPTY_WORKFLOW_FORM)).toMatch(/name/);
    expect(workflowFormProblem({ ...form, kpiId: '' })).toMatch(/KPI/);
    expect(workflowFormProblem({ ...form, value: '' })).toMatch(/number/);
    expect(workflowFormProblem({ ...form, value: 'lots' })).toMatch(/number/);
    expect(workflowFormProblem({ ...form, taskTitle: '  ' })).toMatch(/title/);
  });
});

describe('formFromWorkflow', () => {
  test('an automation this form made comes back as the form', () => {
    expect(formFromWorkflow(workflow())).toEqual({
      name: 'Celebrate big MRR',
      kpiId: 'kpi-1',
      operator: '>',
      value: '100000',
      taskTitle: 'Celebrate!',
      assigneeUserId: '',
      priority: '',
      dueInDays: '',
    });
  });

  test('one of another kind (made through the API) is not editable here', () => {
    expect(formFromWorkflow(workflow({ action: { kind: 'post_webhook', subscriptionId: 's' } }))).toBeNull();
    expect(formFromWorkflow(workflow({ rule: null }))).toBeNull();
  });
});

describe('describeWorkflow', () => {
  test('reads as a sentence, with the KPI by name', () => {
    expect(describeWorkflow(workflow(), names)).toBe('When Monthly Revenue goes above 100000, create the task “Celebrate!”');
  });

  // Flow walk (automations): "goes above 100000" — the page's own example says "100,000".
  test('numbers are written the way the organisation writes them', () => {
    const grouped = (n: number) => n.toLocaleString('en-US');
    expect(describeWorkflow(workflow(), names, grouped)).toBe('When Monthly Revenue goes above 100,000, create the task “Celebrate!”');
    expect(describeWorkflow(workflow({ rule: { kind: 'kpi_change_pct', kpiId: 'kpi-1', operator: '>', value: 12.5 } }), names, grouped)).toContain('goes above 12.5%');
  });

  test('a KPI that has since gone is said, not shown as an id', () => {
    expect(describeWorkflow(workflow({ rule: { kind: 'kpi_value', kpiId: 'gone', operator: '<', value: 5 } }), names)).toBe(
      'When a KPI that no longer exists drops below 5, create the task “Celebrate!”',
    );
  });

  test('other kinds are described too', () => {
    expect(describeWorkflow(workflow({ rule: null, action: { kind: 'post_webhook', subscriptionId: 's' } }), names)).toBe('Every time it is triggered, call a webhook');
    expect(describeWorkflow(workflow({ rule: { kind: 'alert_severity', operator: '>=', severity: 'HIGH' }, action: { kind: 'send_notification', channelId: 'c', message: 'm' } }), names)).toBe(
      'When an alert’s severity reaches or goes above high, send a notification',
    );
  });
});

// Manual QA (2026-11-19, F-041): the task an automation made had no owner, due date or priority, and the form
// offered none. The form now carries them, and the body sends them the way the rule engine reads them.
describe('an automation\'s task has an owner, a priority and a due date', () => {
  const full = { ...EMPTY_WORKFLOW_FORM, name: 'CSAT watch', kpiId: 'k1', operator: '<', value: '4', taskTitle: 'Investigate CSAT drop', assigneeUserId: 'u7', priority: 'HIGH' as const, dueInDays: '2' };

  test('sends the owner, the priority and the due date in hours', () => {
    expect(workflowBody(full).action).toEqual({ kind: 'create_task', title: 'Investigate CSAT drop', assigneeUserId: 'u7', priority: 'HIGH', dueAtRelativeHours: 48 });
  });

  test('leaves out what was not chosen', () => {
    expect(workflowBody({ ...full, assigneeUserId: '', priority: '', dueInDays: '' }).action).toEqual({ kind: 'create_task', title: 'Investigate CSAT drop' });
  });

  test('refuses a due date that is not a whole number of days', () => {
    expect(workflowFormProblem({ ...full, dueInDays: '1.5' })).toMatch(/whole number of days/);
    expect(workflowFormProblem({ ...full, dueInDays: '0' })).toMatch(/at least 1/);
    expect(workflowFormProblem(full)).toBeNull();
  });

  test('reads them back from a saved automation', () => {
    const wf = { id: 'w', name: 'CSAT watch', description: null, triggers: ['kpi_changed'], isActive: true, lastRunAt: null,
      rule: { kind: 'kpi_value', kpiId: 'k1', operator: '<', value: 4 },
      action: { kind: 'create_task', title: 'Investigate CSAT drop', assigneeUserId: 'u7', priority: 'HIGH', dueAtRelativeHours: 48 } };
    expect(formFromWorkflow(wf)).toMatchObject({ assigneeUserId: 'u7', priority: 'HIGH', dueInDays: '2' });
  });
});
