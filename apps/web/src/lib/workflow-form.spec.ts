import { describe, expect, test } from 'vitest';

import type { Workflow } from './collab-client';
import { EMPTY_WORKFLOW_FORM, OPERATORS, describeWorkflow, formFromWorkflow, workflowBody, workflowFormProblem } from './workflow-form';

const form = { name: 'Celebrate big MRR', kpiId: 'kpi-1', operator: '>', value: '100000', taskTitle: ' Celebrate! ' };
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
    expect(formFromWorkflow(workflow())).toEqual({ name: 'Celebrate big MRR', kpiId: 'kpi-1', operator: '>', value: '100000', taskTitle: 'Celebrate!' });
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
