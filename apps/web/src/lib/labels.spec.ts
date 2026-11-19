import { describe, expect, test } from 'vitest';

import {
  AUDIT_ACTION_LABELS,
  BAND_STATUS_LABELS,
  DIRECTION_LABELS,
  FREQUENCY_LABELS,
  HEALTH_STATUS_LABELS,
  KPI_STATUS_LABELS,
  KPI_TYPE_LABELS,
  QUADRANT_LABELS,
  SCOPE_LABELS,
  WIDGET_TYPE_LABELS,
  activityLabel,
  activitySentence,
  entityLabel,
  humanize,
  labelFor,
} from './labels';

describe('labelFor (X-03)', () => {
  test('known values use the map', () => {
    expect(labelFor(SCOPE_LABELS, 'PER_UNIT')).toBe('Per unit');
    expect(labelFor(DIRECTION_LABELS, 'LOWER_IS_BETTER')).toBe('Lower is better');
    expect(labelFor(QUADRANT_LABELS, 'INTERNAL_PROCESS')).toBe('Internal process');
    expect(labelFor(HEALTH_STATUS_LABELS, 'ON_TRACK')).toBe('On track');
    expect(labelFor(BAND_STATUS_LABELS, 'no_bands')).toBe('No bands set');
    expect(labelFor(WIDGET_TYPE_LABELS, 'kpi_card')).toBe('KPI card');
    expect(labelFor(FREQUENCY_LABELS, 'AD_HOC')).toBe('Ad hoc');
    expect(labelFor(KPI_TYPE_LABELS, 'PERCENTAGE')).toBe('Percentage');
    expect(labelFor(KPI_STATUS_LABELS, 'DEPRECATED')).toBe('Deprecated');
  });

  test('an unknown value is still readable, never a raw enum', () => {
    expect(labelFor(SCOPE_LABELS, 'SOME_NEW_SCOPE')).toBe('Some new scope');
  });

  test('missing values show a dash', () => {
    expect(labelFor(SCOPE_LABELS, null)).toBe('—');
    expect(labelFor(SCOPE_LABELS, undefined)).toBe('—');
    expect(labelFor(SCOPE_LABELS, '')).toBe('—');
  });
});

describe('humanize', () => {
  test('SNAKE_CASE, snake_case and PascalCase all become a sentence-case phrase', () => {
    expect(humanize('LOWER_IS_BETTER')).toBe('Lower is better');
    expect(humanize('strategy_map')).toBe('Strategy map');
    expect(humanize('OrgUnitMember')).toBe('Org unit member');
  });

  test('KPI stays capitalised', () => {
    expect(humanize('KPI_DEFINITION')).toBe('KPI definition');
    expect(humanize('KPIDataPoint')).toBe('KPI data point');
    expect(humanize('kpi')).toBe('KPI');
  });
});

describe('activity wording', () => {
  test('entity types read as things, whatever their casing in the audit log', () => {
    expect(entityLabel('KPIDataPoint')).toBe('KPI value');
    expect(entityLabel('kpi')).toBe('KPI');
    expect(entityLabel('RoleDefinition')).toBe('role');
    expect(entityLabel('organization')).toBe('organisation');
    expect(entityLabel('SomethingNew')).toBe('something new');
  });

  test('an audit row reads as a past-tense phrase', () => {
    expect(labelFor(AUDIT_ACTION_LABELS, 'CREATE')).toBe('created');
    expect(activityLabel('UPDATE', 'kpi')).toBe('updated a KPI');
    expect(activityLabel('CREATE', 'organization')).toBe('created an organisation');
    expect(activityLabel('DELETE', 'Objective')).toBe('deleted an objective');
    expect(activityLabel('LOGIN', 'User')).toBe('signed in');
    expect(activityLabel('LOGOUT', null)).toBe('signed out');
  });
});

// Flow walk (activity): every row read "created a KPI value" — not which KPI, not what value.
describe('activitySentence', () => {
  const num = (n: number) => n.toLocaleString('en-US');
  const row = (action: string, entityType: string, entityId: string | null, metadata: unknown, subject: { name: string | null; kpiId: string | null; kpiName: string | null }) => ({ action, entityType, entityId, metadata, subject });
  const none = { name: null, kpiId: null, kpiName: null };
  const rev = { name: null, kpiId: 'k1', kpiName: 'Monthly revenue' };

  test('a recorded value says the value and the KPI, and leads to the KPI', () => {
    expect(activitySentence(row('CREATE', 'KPIDataPoint', 'dp', { kpiId: 'k1', value: 35000 }, rev), num)).toEqual({ text: 'recorded 35,000 on Monthly revenue', href: '/kpis/k1' });
  });
  test('a corrected value says from what to what', () => {
    expect(activitySentence(row('UPDATE', 'KPIDataPoint', 'dp', { kpiId: 'k1', previousValue: 42, newValue: 45 }, rev), num).text).toBe('changed a value on Monthly revenue from 42 to 45');
  });
  test('a thing with a name is named, and linked when it has a page', () => {
    expect(activitySentence(row('CREATE', 'KPI', 'k1', { name: 'Monthly revenue' }, { ...rev, name: 'Monthly revenue' }), num)).toEqual({ text: 'created the KPI “Monthly revenue”', href: '/kpis/k1' });
    expect(activitySentence(row('CREATE', 'Objective', 'o1', { name: 'Grow' }, { ...none, name: 'Grow' }), num)).toEqual({ text: 'created the objective “Grow”', href: '/okrs/o1' });
    expect(activitySentence(row('CREATE', 'Task', 't1', { title: 'Call the bank' }, { ...none, name: 'Call the bank' }), num)).toEqual({ text: 'created the task “Call the bank”', href: '/tasks' });
  });
  test('something about a KPI that has no name of its own says which KPI', () => {
    expect(activitySentence(row('CREATE', 'KPITarget', 't', { kpiId: 'k1' }, rev), num)).toEqual({ text: 'created a KPI target on Monthly revenue', href: '/kpis/k1' });
  });
  test('a deleted thing is named but not linked; a row that knows nothing more reads as before', () => {
    expect(activitySentence(row('DELETE', 'Dashboard', 'd1', { name: 'Board' }, { ...none, name: 'Board' }), num)).toEqual({ text: 'deleted the dashboard “Board”', href: null });
    expect(activitySentence(row('CREATE', 'KPIDataPoint', 'dp', { kpiId: 'gone', value: 1 }, none), num)).toEqual({ text: 'created a KPI value', href: null });
    expect(activitySentence(row('LOGIN', 'User', 'u', null, none), num)).toEqual({ text: 'signed in', href: null });
  });
});
