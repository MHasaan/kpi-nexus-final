/**
 * Flow walk (anomalies): the method picker offered "ensemble", "zscore",
 * "ewma" and "isolation_forest", and a saved anomaly named its method as
 * "ZSCORE". Each has a name a person can read and a line on what it flags.
 */
import { describe, expect, test } from 'vitest';

import { ANOMALY_METHODS, anomalyMethodLabel } from './anomaly-method';

describe('anomaly methods', () => {
  test('every method the service runs is offered, with a name and what it flags', () => {
    expect(ANOMALY_METHODS.map((m) => m.value)).toEqual(['ensemble', 'zscore', 'ewma', 'isolation_forest']);
    for (const m of ANOMALY_METHODS) {
      expect(m.label).not.toMatch(/_|zscore|ewma/i);
      expect(m.about.length).toBeGreaterThan(20);
    }
  });
  test('a stored method reads the same however it was written; an unknown one is still readable', () => {
    expect(anomalyMethodLabel('zscore')).toBe('Far from the average');
    expect(anomalyMethodLabel('ZSCORE')).toBe('Far from the average');
    expect(anomalyMethodLabel('ISOLATION_FOREST')).toBe('Unlike the rest');
    expect(anomalyMethodLabel('some_new_method')).toBe('Some new method');
  });
});
