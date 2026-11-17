import { describe, expect, test } from 'vitest';

import { kpiCount, strategyMapTally, tallyWords } from './strategy-map';

const row = (scorecardQuadrant: string | null, status: string) => ({ scorecardQuadrant, status }) as never;

describe('strategyMapTally', () => {
  test('counts each perspective by health, in strategy-map order', () => {
    const tally = strategyMapTally([
      row('FINANCIAL', 'ON_TRACK'),
      row('FINANCIAL', 'OFF_TRACK'),
      row('FINANCIAL', 'NO_TARGET'),
      row('CUSTOMER', 'AT_RISK'),
      row('CUSTOMER', 'ON_TRACK'),
      row('LEARNING_GROWTH', 'NO_DATA'),
    ]);
    expect(tally.perspectives.map((p) => p.perspective)).toEqual(['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH']);
    expect(tally.perspectives[0]).toEqual({ perspective: 'FINANCIAL', total: 3, onTrack: 1, atRisk: 0, offTrack: 1, unrated: 1, worst: 'OFF_TRACK' });
    expect(tally.perspectives[1]).toMatchObject({ total: 2, atRisk: 1, onTrack: 1, worst: 'AT_RISK' });
    expect(tally.perspectives[2]).toMatchObject({ total: 0, worst: 'NONE' });
    expect(tally.perspectives[3]).toMatchObject({ total: 1, unrated: 1, worst: 'NONE' });
    expect(tally.unassigned).toBe(0);
  });

  test('KPIs with no perspective — or one this map does not know — are counted, not dropped', () => {
    expect(strategyMapTally([row(null, 'ON_TRACK'), row('SOMETHING_ELSE', 'ON_TRACK'), row('CUSTOMER', 'ON_TRACK')]).unassigned).toBe(2);
  });

  test('nothing at all is four empty tiles', () => {
    const tally = strategyMapTally([]);
    expect(tally.perspectives.every((p) => p.total === 0 && p.worst === 'NONE')).toBe(true);
    expect(tally.unassigned).toBe(0);
  });
});

describe('words', () => {
  test('kpiCount', () => {
    expect(kpiCount(0)).toBe('No KPIs yet');
    expect(kpiCount(1)).toBe('1 KPI');
    expect(kpiCount(4)).toBe('4 KPIs');
  });

  test('tallyWords puts the worst first and leaves out zeros', () => {
    const [financial, , internal] = strategyMapTally([row('FINANCIAL', 'ON_TRACK'), row('FINANCIAL', 'ON_TRACK'), row('FINANCIAL', 'OFF_TRACK'), row('FINANCIAL', 'NO_DATA')]).perspectives;
    expect(tallyWords(financial!)).toBe('1 off track · 2 on track · 1 not rated');
    expect(tallyWords(internal!)).toBe('');
  });
});
