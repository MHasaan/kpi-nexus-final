import { describe, expect, test } from 'vitest';

import { canHoldKpis, personKpiCandidates } from './person-kpi-candidates';

const kpi = (id: string, scope = 'PER_USER', extra: Record<string, unknown> = {}) => ({ id, scope, ...extra });

describe('personKpiCandidates', () => {
  test('offers per-person KPIs the person does not hold', () => {
    expect(personKpiCandidates([kpi('a'), kpi('b')], [{ kpiId: 'a' }]).map((k) => k.id)).toEqual(['b']);
  });

  test('never offers an org-wide or per-unit KPI', () => {
    const all = [kpi('org', 'ORG_WIDE'), kpi('unit', 'PER_UNIT'), kpi('me')];
    expect(personKpiCandidates(all, []).map((k) => k.id)).toEqual(['me']);
  });

  test('never offers an archived or deleted KPI', () => {
    const all = [kpi('old', 'PER_USER', { isArchived: true }), kpi('gone', 'PER_USER', { deletedAt: '2026-01-01' }), kpi('live')];
    expect(personKpiCandidates(all, []).map((k) => k.id)).toEqual(['live']);
  });
});

describe('canHoldKpis', () => {
  test('someone invited, active or suspended can be given a KPI', () => {
    for (const s of ['INVITED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED']) expect(canHoldKpis(s)).toBe(true);
  });
  test('someone archived or deleted cannot', () => {
    for (const s of ['ARCHIVED', 'DELETED', 'PURGED']) expect(canHoldKpis(s)).toBe(false);
  });
});
