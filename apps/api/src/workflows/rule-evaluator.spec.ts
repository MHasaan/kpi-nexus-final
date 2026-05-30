/**
 * Pure rule evaluator for the generic workflow engine. Covers all 6 operators,
 * each rule kind (kpi_value, kpi_change_pct, alert_severity), kpi-id mismatch,
 * and the null-rule (always-fire) case.
 */
import { describe, expect, test } from 'vitest';

import { evaluateRule } from './rule-evaluator.js';

describe('evaluateRule — kpi_value', () => {
  const rule = { kind: 'kpi_value', kpiId: 'kpi_1', operator: '>', value: 100 } as const;

  test('> true', () => {
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'kpi_1', value: 150 })).toBe(true);
  });
  test('> false', () => {
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'kpi_1', value: 50 })).toBe(false);
  });
  test('different kpiId → false (rule not applicable)', () => {
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'kpi_OTHER', value: 9999 })).toBe(false);
  });

  test('all 6 operators', () => {
    const ev = (operator: string, value: number) =>
      evaluateRule({ kind: 'kpi_value', kpiId: 'k', operator, value }, { kind: 'kpi_changed', kpiId: 'k', value: 10 });
    expect(ev('>', 5)).toBe(true);
    expect(ev('<', 20)).toBe(true);
    expect(ev('>=', 10)).toBe(true);
    expect(ev('<=', 10)).toBe(true);
    expect(ev('==', 10)).toBe(true);
    expect(ev('!=', 11)).toBe(true);
    expect(ev('==', 11)).toBe(false);
  });
});

describe('evaluateRule — kpi_change_pct', () => {
  test('compares the event change percentage', () => {
    const rule = { kind: 'kpi_change_pct', kpiId: 'k', operator: '>=', value: 20 };
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'k', value: 0, changePct: 25 })).toBe(true);
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'k', value: 0, changePct: 10 })).toBe(false);
  });
});

describe('evaluateRule — alert_severity', () => {
  test('>= orders LOW < MEDIUM < HIGH', () => {
    const rule = { kind: 'alert_severity', operator: '>=', severity: 'MEDIUM' };
    expect(evaluateRule(rule, { kind: 'alert', severity: 'HIGH' })).toBe(true);
    expect(evaluateRule(rule, { kind: 'alert', severity: 'MEDIUM' })).toBe(true);
    expect(evaluateRule(rule, { kind: 'alert', severity: 'LOW' })).toBe(false);
  });
  test('== matches exact severity', () => {
    const rule = { kind: 'alert_severity', operator: '==', severity: 'HIGH' };
    expect(evaluateRule(rule, { kind: 'alert', severity: 'HIGH' })).toBe(true);
    expect(evaluateRule(rule, { kind: 'alert', severity: 'LOW' })).toBe(false);
  });
});

describe('evaluateRule — edge cases', () => {
  test('null/undefined rule → always fires', () => {
    expect(evaluateRule(null, { kind: 'kpi_changed', kpiId: 'k', value: 1 })).toBe(true);
    expect(evaluateRule(undefined, { kind: 'alert', severity: 'LOW' })).toBe(true);
  });
  test('rule kind not matching event kind → false', () => {
    const rule = { kind: 'alert_severity', operator: '>=', severity: 'LOW' };
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'k', value: 1 })).toBe(false);
  });
  test('unknown operator → false (fail closed)', () => {
    const rule = { kind: 'kpi_value', kpiId: 'k', operator: '≈', value: 1 };
    expect(evaluateRule(rule, { kind: 'kpi_changed', kpiId: 'k', value: 1 })).toBe(false);
  });
});
