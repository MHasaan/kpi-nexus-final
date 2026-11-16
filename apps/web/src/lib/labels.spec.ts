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
