import { describe, expect, it } from 'vitest';

import { canTransition, KPI_STATUS_TRANSITIONS, type KpiStatus } from './kpi-status.js';

const ALL: KpiStatus[] = ['DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'DEPRECATED', 'ARCHIVED'];

describe('KPI status state machine', () => {
  it('allows the documented forward transitions', () => {
    expect(canTransition('DRAFT', 'PROPOSED')).toBe(true);
    expect(canTransition('PROPOSED', 'APPROVED')).toBe(true);
    expect(canTransition('PROPOSED', 'DRAFT')).toBe(true); // rework
    expect(canTransition('APPROVED', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'DEPRECATED')).toBe(true);
    expect(canTransition('DEPRECATED', 'ARCHIVED')).toBe(true);
  });

  it('every status can be archived except ARCHIVED itself', () => {
    for (const s of ALL) {
      expect(canTransition(s, 'ARCHIVED')).toBe(s !== 'ARCHIVED');
    }
  });

  it('ARCHIVED is terminal', () => {
    for (const s of ALL) {
      expect(canTransition('ARCHIVED', s)).toBe(false);
    }
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(false);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('APPROVED', 'PAUSED')).toBe(false);
    expect(canTransition('DEPRECATED', 'ACTIVE')).toBe(false);
  });

  it('a status is never a valid transition to itself', () => {
    for (const s of ALL) {
      expect(KPI_STATUS_TRANSITIONS[s].includes(s)).toBe(false);
    }
  });
});
