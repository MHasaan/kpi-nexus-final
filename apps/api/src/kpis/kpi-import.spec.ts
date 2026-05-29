import { describe, expect, it } from 'vitest';

import { validateKpiCsv } from './kpi-import.js';

describe('validateKpiCsv', () => {
  it('parses a minimal valid CSV (name only) with defaults', () => {
    const r = validateKpiCsv('name\nRevenue');
    expect(r.errors).toHaveLength(0);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]).toMatchObject({ name: 'Revenue', scope: 'ORG_WIDE', type: 'NUMBER', status: 'DRAFT' });
  });

  it('accepts case-insensitive column aliases ("KPI Name", "Target")', () => {
    const r = validateKpiCsv('KPI Name,Target\nMRR,100');
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0]).toMatchObject({ name: 'MRR', targetValue: 100 });
  });

  it('errors when the name column is missing entirely', () => {
    const r = validateKpiCsv('foo,bar\n1,2');
    expect(r.valid).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/name.*column/i);
  });

  it('errors on a blank/too-short name', () => {
    const r = validateKpiCsv('name\n\nA');
    expect(r.valid).toHaveLength(0);
    expect(r.errors.some((e) => e.column === 'name')).toBe(true);
  });

  it('validates enum values and reports invalid ones', () => {
    const r = validateKpiCsv('name,scope\nGood,ORG_WIDE\nBad,GALAXY_WIDE');
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]!.name).toBe('Good');
    expect(r.errors.some((e) => e.column === 'scope' && e.row === 2)).toBe(true);
  });

  it('normalizes enum casing/spacing ("higher is better" → HIGHER_IS_BETTER)', () => {
    const r = validateKpiCsv('name,direction\nNPS,higher is better');
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0]!.direction).toBe('HIGHER_IS_BETTER');
  });

  it('coerces numbers and strips $/%/commas', () => {
    const r = validateKpiCsv('name,target\nRev,"$1,250"');
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0]!.targetValue).toBe(1250);
  });

  it('errors on a non-numeric target', () => {
    const r = validateKpiCsv('name,target\nRev,abc');
    expect(r.valid).toHaveLength(0);
    expect(r.errors.some((e) => e.column === 'targetValue')).toBe(true);
  });

  it('enforces threshold ordering for HIGHER_IS_BETTER (critical ≤ warning)', () => {
    const ok = validateKpiCsv('name,direction,warning,critical\nUptime,HIGHER_IS_BETTER,80,60');
    expect(ok.errors).toHaveLength(0);
    const bad = validateKpiCsv('name,direction,warning,critical\nUptime,HIGHER_IS_BETTER,60,80');
    expect(bad.errors.some((e) => e.column === 'criticalThreshold')).toBe(true);
  });

  it('enforces threshold ordering for LOWER_IS_BETTER (warning ≤ critical)', () => {
    const ok = validateKpiCsv('name,direction,warning,critical\nLatency,LOWER_IS_BETTER,60,80');
    expect(ok.errors).toHaveLength(0);
    const bad = validateKpiCsv('name,direction,warning,critical\nLatency,LOWER_IS_BETTER,80,60');
    expect(bad.errors.some((e) => e.column === 'warningThreshold')).toBe(true);
  });

  it('detects intra-CSV duplicate names (case-insensitive)', () => {
    const r = validateKpiCsv('name\nChurn\nchurn');
    expect(r.valid).toHaveLength(1);
    expect(r.errors.some((e) => /duplicate/i.test(e.message))).toBe(true);
  });

  it('detects existing-org duplicate names', () => {
    const r = validateKpiCsv('name\nMRR', new Set(['mrr']));
    expect(r.valid).toHaveLength(0);
    expect(r.errors.some((e) => /already exists/i.test(e.message))).toBe(true);
  });

  it('handles quoted fields containing commas', () => {
    const r = validateKpiCsv('name,description\nRev,"Recurring, monthly"');
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0]!.description).toBe('Recurring, monthly');
  });

  it('splits tags on ; or |', () => {
    const r = validateKpiCsv('name,tags\nRev,"finance;growth|core"');
    expect(r.valid[0]!.tags).toEqual(['finance', 'growth', 'core']);
  });

  it('accepts (ignores) a category/quadrant column without error', () => {
    const r = validateKpiCsv('name,quadrant\nRev,Financial');
    expect(r.errors).toHaveLength(0);
    expect(r.valid).toHaveLength(1);
  });

  it('reports an empty CSV', () => {
    const r = validateKpiCsv('   ');
    expect(r.errors[0]!.message).toMatch(/empty/i);
  });

  it('rejects PER_UNIT/PER_USER scopes (need assignments not expressible in CSV)', () => {
    const r = validateKpiCsv('name,scope\nUnitKpi,PER_UNIT');
    expect(r.valid).toHaveLength(0);
    expect(r.errors.some((e) => e.column === 'scope' && /ORG_WIDE only/i.test(e.message))).toBe(true);
  });

  it('processes a multi-row mix, keeping valid rows and flagging bad ones', () => {
    const csv = [
      'name,scope,target',
      'Good One,ORG_WIDE,10',
      'Bad Enum,NOPE,20',
      'Good Two,ORG_WIDE,30',
    ].join('\n');
    const r = validateKpiCsv(csv);
    expect(r.totalRows).toBe(3);
    expect(r.valid.map((v) => v.name)).toEqual(['Good One', 'Good Two']);
    expect(r.errors.some((e) => e.row === 2)).toBe(true);
  });
});
