import { describe, expect, test } from 'vitest';

import { kpiTabFromParam, kpiTabHref, kpiTabsFor } from './kpi-detail-tabs';

describe('KPI detail tabs in the address', () => {
  test('a tab is named in lower case; Overview is the page itself', () => {
    expect(kpiTabHref('k1', 'Cascade')).toBe('/kpis/k1?tab=cascade');
    expect(kpiTabHref('k1', 'Overview')).toBe('/kpis/k1');
  });

  test('the address opens the tab it names, whatever its case', () => {
    expect(kpiTabFromParam('cascade', 'ORG_WIDE')).toBe('Cascade');
    expect(kpiTabFromParam('TARGETS', 'ORG_WIDE')).toBe('Targets');
  });

  test('no tab, or one this KPI does not have, opens Overview', () => {
    expect(kpiTabFromParam(null, 'ORG_WIDE')).toBe('Overview');
    expect(kpiTabFromParam('nonsense', 'ORG_WIDE')).toBe('Overview');
    expect(kpiTabFromParam('assignments', 'ORG_WIDE')).toBe('Overview');
    expect(kpiTabFromParam('assignments', 'PER_USER')).toBe('Assignments');
  });

  test('an organisation-wide KPI has no Assignments tab', () => {
    expect(kpiTabsFor('ORG_WIDE')).not.toContain('Assignments');
    expect(kpiTabsFor('PER_UNIT')).toContain('Assignments');
  });
});
