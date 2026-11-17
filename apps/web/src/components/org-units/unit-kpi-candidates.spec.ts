import { describe, expect, test } from 'vitest';

import { parseTarget, unitKpiCandidates } from './unit-kpi-candidates';

const kpi = (id: string, scope = 'PER_UNIT', extra: Record<string, unknown> = {}) => ({ id, scope, ...extra });

describe('unitKpiCandidates', () => {
  test('offers per-unit KPIs the unit does not hold', () => {
    const all = [kpi('a'), kpi('b'), kpi('c')];
    expect(unitKpiCandidates(all, [{ kpiId: 'b' }]).map((k) => k.id)).toEqual(['a', 'c']);
  });

  test('a KPI the unit inherits is held, so it is not offered again', () => {
    expect(unitKpiCandidates([kpi('a')], [{ kpiId: 'a' }])).toEqual([]);
  });

  test('never offers an org-wide or per-person KPI', () => {
    const all = [kpi('org', 'ORG_WIDE'), kpi('me', 'PER_USER'), kpi('unit')];
    expect(unitKpiCandidates(all, []).map((k) => k.id)).toEqual(['unit']);
  });

  test('never offers an archived or deleted KPI', () => {
    const all = [kpi('old', 'PER_UNIT', { isArchived: true }), kpi('gone', 'PER_UNIT', { deletedAt: '2026-01-01' }), kpi('live')];
    expect(unitKpiCandidates(all, []).map((k) => k.id)).toEqual(['live']);
  });
});

describe('parseTarget', () => {
  test('an empty field means no target', () => {
    expect(parseTarget('  ')).toEqual({ ok: true, value: undefined });
  });
  test('a number is a number, zero and negatives included', () => {
    expect(parseTarget('99.5')).toEqual({ ok: true, value: 99.5 });
    expect(parseTarget('0')).toEqual({ ok: true, value: 0 });
    expect(parseTarget('-3')).toEqual({ ok: true, value: -3 });
  });
  test('anything else is refused', () => {
    expect(parseTarget('lots')).toEqual({ ok: false });
    expect(parseTarget('Infinity')).toEqual({ ok: false });
  });
});
