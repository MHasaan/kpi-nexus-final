/**
 * UI-007: a workflow's rule and action were "any JSON object", so the web
 * app's `{ operator: 'GT', threshold }` / `{ type: 'CREATE_TASK' }` either
 * bounced on the trigger name or, worse, was stored and never fired.
 */
import { describe, expect, test } from 'vitest';

import { CreateWorkflowDtoSchema, UpdateWorkflowDtoSchema } from './workflow.dto.js';

const good = {
  name: 'Celebrate big MRR',
  triggers: ['kpi_changed'],
  rule: { kind: 'kpi_value', kpiId: 'kpi-1', operator: '>', value: 100000 },
  action: { kind: 'create_task', title: 'Celebrate!' },
};
const ok = (body: unknown) => CreateWorkflowDtoSchema.safeParse(body).success;

describe('CreateWorkflowDtoSchema', () => {
  test('the three rule kinds and the three action kinds the engine understands are accepted', () => {
    expect(ok(good)).toBe(true);
    expect(ok({ ...good, rule: { kind: 'kpi_change_pct', kpiId: 'kpi-1', operator: '<=', value: -10, windowDays: 7 } })).toBe(true);
    expect(ok({ ...good, triggers: ['alert'], rule: { kind: 'alert_severity', operator: '>=', severity: 'HIGH' } })).toBe(true);
    expect(ok({ ...good, action: { kind: 'post_webhook', subscriptionId: 'sub-1' } })).toBe(true);
    expect(ok({ ...good, action: { kind: 'send_notification', channelId: 'ch-1', message: 'Look at this' } })).toBe(true);
    expect(ok({ ...good, action: { kind: 'create_task', title: 'Follow up', priority: 'HIGH', dueAtRelativeHours: 48, assigneeUserId: 'u-1' } })).toBe(true);
  });

  test('no rule at all means "always": null and absent are both fine', () => {
    expect(ok({ ...good, rule: null })).toBe(true);
    const { rule: _rule, ...withoutRule } = good;
    expect(ok(withoutRule)).toBe(true);
  });

  test.each([
    ['what the web app used to send as a rule', { rule: { kpiId: 'kpi-1', operator: 'GT', threshold: 5 } }],
    ['an operator the engine does not know', { rule: { ...good.rule, operator: 'GT' } }],
    ['a rule with a stray key', { rule: { ...good.rule, threshold: 5 } }],
    ['a value that is not a number', { rule: { ...good.rule, value: '100000' } }],
    ['a rule with no KPI', { rule: { ...good.rule, kpiId: ' ' } }],
    ['a severity that does not exist', { rule: { kind: 'alert_severity', operator: '>=', severity: 'CRITICAL' } }],
    ['what the web app used to send as an action', { action: { type: 'CREATE_TASK', taskTitle: 'Follow up' } }],
    ['a task with no title', { action: { kind: 'create_task', title: '  ' } }],
    ['an action kind the engine does not know', { action: { kind: 'launch_rocket' } }],
    ['a trigger name that does not exist', { triggers: ['KPI_CHANGE'] }],
    ['no trigger', { triggers: [] }],
  ])('refuses %s', (_label, change) => {
    expect(ok({ ...good, ...change })).toBe(false);
  });

  test('a refused rule says which field is wrong', () => {
    const result = CreateWorkflowDtoSchema.safeParse({ ...good, rule: { ...good.rule, operator: 'GT' } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(['rule', 'operator']);
  });
});

describe('UpdateWorkflowDtoSchema', () => {
  test('any subset can be changed — switching on and off needs nothing else', () => {
    expect(UpdateWorkflowDtoSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(UpdateWorkflowDtoSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  test('a rule or action that is sent is still checked', () => {
    expect(UpdateWorkflowDtoSchema.safeParse({ action: { type: 'CREATE_TASK' } }).success).toBe(false);
    expect(UpdateWorkflowDtoSchema.safeParse({ rule: { kind: 'kpi_value', kpiId: 'k', operator: '>', value: 1 } }).success).toBe(true);
  });
});
