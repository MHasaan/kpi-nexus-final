import { describe, expect, test } from 'vitest';

import type { AlertRule } from './api-client';

import {
  type AlertRuleForm,
  EMPTY_ALERT_RULE_FORM,
  alertRuleBody,
  alertRuleProblem,
  conditionSentence,
  delayWords,
  formFromRule,
  levelSummary,
  savedRuleSentence,
  toMinutes,
  toggleId,
} from './alert-rule-form';

const form = (patch: Partial<AlertRuleForm> = {}): AlertRuleForm => ({ ...EMPTY_ALERT_RULE_FORM, name: 'Churn watch', kpiId: 'k1', threshold: '5', ...patch });
const level = (patch: Partial<AlertRuleForm['levels'][number]> = {}) => ({ delayMinutes: 0, channelIds: [], notifyRoleIds: [], notifyUserIds: [], ...patch });

describe('alertRuleProblem', () => {
  test('a filled-in threshold rule can be sent', () => {
    expect(alertRuleProblem(form())).toBeNull();
  });

  test('says what is missing, one thing at a time', () => {
    expect(alertRuleProblem(form({ name: ' ' }))).toBe('Give the rule a name.');
    expect(alertRuleProblem(form({ kpiId: '' }))).toBe('Choose the KPI to watch.');
    expect(alertRuleProblem(form({ threshold: '' }))).toBe('Enter the value to compare against.');
    expect(alertRuleProblem(form({ ruleType: 'DYNAMIC_STDDEV', windowSize: '1' }))).toMatch(/between 2 and 1000/);
    expect(alertRuleProblem(form({ ruleType: 'DYNAMIC_STDDEV', sigmas: '0' }))).toMatch(/above 0/);
    expect(alertRuleProblem(form({ ruleType: 'RATE_OF_CHANGE', percent: '0' }))).toBe('Enter a percentage above 0.');
    expect(alertRuleProblem(form({ ruleType: 'RATE_OF_CHANGE', windowValue: '' }))).toMatch(/period/);
    expect(alertRuleProblem(form({ ruleType: 'RATE_OF_CHANGE', windowValue: '2', windowUnit: 'days' }))).toBeNull();
    expect(alertRuleProblem(form({ ruleType: 'RATE_OF_CHANGE', windowValue: '400', windowUnit: 'days' }))).toMatch(/at most a year/);
    expect(alertRuleProblem(form({ ruleType: 'NO_DATA', staleValue: '0' }))).toMatch(/how long/);
  });

  test('the quiet period is optional, whole, and at most a week', () => {
    expect(alertRuleProblem(form({ cooldownValue: '' }))).toBeNull();
    expect(alertRuleProblem(form({ cooldownValue: '6', cooldownUnit: 'hours' }))).toBeNull();
    expect(alertRuleProblem(form({ cooldownValue: '0.5', cooldownUnit: 'minutes' }))).toMatch(/whole number/);
    expect(alertRuleProblem(form({ cooldownValue: '8', cooldownUnit: 'days' }))).toMatch(/7 days/);
  });

  test('a step that reaches nobody is named; people without a channel are enough', () => {
    expect(alertRuleProblem(form({ levels: [level({ notifyRoleIds: ['r1'] }), level()] }))).toBe('Step 2 notifies nobody. Choose who to notify, or remove the step.');
    expect(alertRuleProblem(form({ levels: [level({ notifyUserIds: ['u1'] })] }))).toBeNull();
    expect(alertRuleProblem(form({ levels: [level({ channelIds: ['c1'] })] }))).toBeNull();
  });
});

describe('alertRuleBody', () => {
  test('threshold, with description and quiet period', () => {
    expect(alertRuleBody(form({ description: ' Tell finance ', cooldownValue: '2', cooldownUnit: 'hours' }))).toEqual({
      kpiId: 'k1',
      name: 'Churn watch',
      description: 'Tell finance',
      ruleType: 'STATIC_THRESHOLD',
      severity: 'MEDIUM',
      config: { operator: '>', value: 5, cooldownMinutes: 120 },
    });
  });

  test('a fall is sent as a negative percentage, a rise as a positive one; the period in minutes', () => {
    expect(alertRuleBody(form({ ruleType: 'RATE_OF_CHANGE', direction: 'fall', percent: '20', windowValue: '1', windowUnit: 'days' })).config).toEqual({ pctChange: -20, windowMinutes: 1440 });
    expect(alertRuleBody(form({ ruleType: 'RATE_OF_CHANGE', direction: 'rise', percent: '7.5', windowValue: '3', windowUnit: 'hours' })).config).toEqual({ pctChange: 7.5, windowMinutes: 180 });
  });

  test('unusual value and no data', () => {
    expect(alertRuleBody(form({ ruleType: 'DYNAMIC_STDDEV', sigmas: '2.5', windowSize: '6' })).config).toEqual({ sigmas: 2.5, windowSize: 6 });
    expect(alertRuleBody(form({ ruleType: 'NO_DATA', staleValue: '2', staleUnit: 'days' })).config).toEqual({ maxStaleMinutes: 2880 });
  });

  test('steps are sent as they are; none means no escalation key', () => {
    const steps = [level({ notifyRoleIds: ['r1'], notifyUserIds: ['u1'] })];
    expect(alertRuleBody(form({ levels: steps })).escalationLevels).toEqual(steps);
    expect('escalationLevels' in alertRuleBody(form())).toBe(false);
  });
});

describe('conditionSentence', () => {
  test('reads as a sentence for each kind', () => {
    expect(conditionSentence(form(), 'Churn')).toBe('Alert when Churn is above 5.');
    expect(conditionSentence(form({ ruleType: 'RATE_OF_CHANGE' }), 'Revenue')).toBe('Alert when Revenue falls by 20% or more within 1 day.');
    expect(conditionSentence(form({ ruleType: 'DYNAMIC_STDDEV' }), 'Revenue')).toBe(
      'Alert when a new value of Revenue is 3 or more standard deviations away from the average of the 12 values before it.',
    );
    expect(conditionSentence(form({ ruleType: 'NO_DATA', staleValue: '3', staleUnit: 'hours' }), undefined)).toBe('Alert when no value has been recorded for the KPI in 3 hours.');
  });
});

describe('recipients', () => {
  const directory = {
    roles: [{ id: 'r1', name: 'Manager' }],
    users: [
      { id: 'u1', fullName: 'Mia Manager', roleId: 'r1', status: 'ACTIVE' },
      { id: 'u2', fullName: 'Max Manager', roleId: 'r1', status: 'ACTIVE' },
      { id: 'u3', fullName: 'Gone Manager', roleId: 'r1', status: 'ARCHIVED' },
      { id: 'u4', fullName: 'Eve Editor', roleId: 'r2', status: 'ACTIVE' },
    ],
    channels: [{ id: 'c1', name: 'Ops email' }],
  };

  test('says when, and who — roles with a head count, people, channels', () => {
    expect(levelSummary(level({ notifyRoleIds: ['r1'], notifyUserIds: ['u4'], channelIds: ['c1'] }), directory)).toBe(
      'Straight away: everyone with the Manager role (2 people), Eve Editor and the Ops email channel.',
    );
  });

  test('someone named who already holds a chosen role is not listed twice', () => {
    expect(levelSummary(level({ notifyRoleIds: ['r1'], notifyUserIds: ['u1'] }), directory)).toBe('Straight away: everyone with the Manager role (2 people).');
  });

  test('a later step says it waits for an acknowledgement', () => {
    expect(levelSummary(level({ delayMinutes: 30, notifyUserIds: ['u4'] }), directory)).toBe('After 30 minutes, if nobody has acknowledged it: Eve Editor.');
    expect(levelSummary(level({ delayMinutes: 60 }), directory)).toBe('After 1 hour: nobody yet.');
  });

  // The alert page names people for a reader who may not list them: it has names for ids, nothing more.
  test('a person known only by name is still named', () => {
    expect(levelSummary(level({ notifyUserIds: ['u9'] }), { ...directory, users: [], names: [{ id: 'u9', fullName: 'Nia Named' }] })).toBe('Straight away: Nia Named.');
  });

  test('without the people list, a role is named without a count', () => {
    expect(levelSummary(level({ notifyRoleIds: ['r1'] }), { ...directory, users: [] })).toBe('Straight away: everyone with the Manager role.');
  });

  test('helpers', () => {
    expect(delayWords(0)).toBe('Straight away');
    expect(delayWords(2880)).toBe('After 2 days');
    expect(toMinutes('1.5', 'hours')).toBe(90);
    expect(toMinutes('1.5', 'minutes')).toBeNull();
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

// Flow walk (alert rules): the list said a rule's type — "Threshold", "Anomaly (σ)" — and not what it watches for.
describe('savedRuleSentence', () => {
  const grouped = (n: number) => n.toLocaleString('en-US');
  test('a saved rule reads as what it watches for, with numbers written the organisation\'s way', () => {
    expect(savedRuleSentence({ ruleType: 'STATIC_THRESHOLD', config: { operator: '<', value: 50000 } }, grouped)).toBe('When the value is below 50,000');
    expect(savedRuleSentence({ ruleType: 'DYNAMIC_STDDEV', config: { sigmas: 3, windowSize: 12 } }, grouped)).toBe(
      'When a new value is 3 or more standard deviations from the average of the 12 before it',
    );
    expect(savedRuleSentence({ ruleType: 'RATE_OF_CHANGE', config: { pctChange: -20, windowMinutes: 1440 } }, grouped)).toBe('When it falls by 20% or more within 1 day');
    expect(savedRuleSentence({ ruleType: 'RATE_OF_CHANGE', config: { pctChange: 15, windowMinutes: 90 } }, grouped)).toBe('When it rises by 15% or more within 90 minutes');
    expect(savedRuleSentence({ ruleType: 'NO_DATA', config: { maxStaleMinutes: 2880 } }, grouped)).toBe('When no value has been recorded in 2 days');
  });
  test('a rule it cannot read is named by its kind, never shown as stored', () => {
    expect(savedRuleSentence({ ruleType: 'COMPOSITE', config: {} }, grouped)).toBe('When several conditions are met together');
    expect(savedRuleSentence({ ruleType: 'STATIC_THRESHOLD', config: null }, grouped)).toBe('Crosses a fixed value');
  });
});

// Manual QA (2026-11-20, F-069): a rule could not be edited beyond its name, severity and description. The
// form that makes a rule now also opens a saved one.
describe('formFromRule', () => {
  const saved = (form: AlertRuleForm): AlertRule => {
    const body = alertRuleBody(form);
    return {
      id: 'rule_1',
      organizationId: 'org',
      kpiId: body.kpiId,
      name: body.name,
      description: body.description ?? null,
      ruleType: body.ruleType,
      config: body.config,
      severity: body.severity,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdById: 'u1',
      escalationRule: body.escalationLevels ? { id: 'esc', levels: body.escalationLevels, createdAt: '', updatedAt: '' } : null,
    };
  };
  const base: AlertRuleForm = { ...EMPTY_ALERT_RULE_FORM, name: 'MRR below floor', description: 'Check the pipeline', kpiId: 'kpi_1', severity: 'HIGH' };

  test('a saved rule of each kind comes back as the form that made it', () => {
    const forms: AlertRuleForm[] = [
      { ...base, ruleType: 'STATIC_THRESHOLD', operator: '<', threshold: '230000', cooldownValue: '2', cooldownUnit: 'hours', levels: [{ delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: ['u1'] }] },
      { ...base, ruleType: 'DYNAMIC_STDDEV', sigmas: '2.5', windowSize: '12' },
      { ...base, ruleType: 'RATE_OF_CHANGE', direction: 'fall', percent: '15', windowValue: '7', windowUnit: 'days' },
      { ...base, ruleType: 'NO_DATA', staleValue: '36', staleUnit: 'hours' },
    ];
    for (const form of forms) {
      const back = formFromRule(saved(form));
      expect(back, form.ruleType).not.toBeNull();
      expect(alertRuleBody(back!)).toEqual(alertRuleBody(form));
    }
  });

  test('minutes come back in the largest whole unit', () => {
    const rule = saved({ ...base, ruleType: 'NO_DATA', staleValue: '2880', staleUnit: 'minutes', cooldownValue: '90', cooldownUnit: 'minutes' });
    const back = formFromRule(rule)!;
    expect([back.staleValue, back.staleUnit]).toEqual(['2', 'days']);
    expect([back.cooldownValue, back.cooldownUnit]).toEqual(['90', 'minutes']);
  });

  test('a composite rule is not one the form can edit', () => {
    const rule = { ...saved(base), ruleType: 'COMPOSITE' as const, config: { operator: 'AND', parts: [] } };
    expect(formFromRule(rule)).toBeNull();
  });
});
