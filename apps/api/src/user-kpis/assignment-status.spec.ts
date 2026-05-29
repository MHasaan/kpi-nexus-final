import { describe, expect, it } from 'vitest';

import { computeAssignmentStatus } from './assignment-status.js';

describe('computeAssignmentStatus (direction-aware vs target)', () => {
  it('returns null when there is no target or no value', () => {
    expect(computeAssignmentStatus(10, null, 'HIGHER_IS_BETTER')).toBeNull();
    expect(computeAssignmentStatus(null, 10, 'HIGHER_IS_BETTER')).toBeNull();
    expect(computeAssignmentStatus(null, null, 'HIGHER_IS_BETTER')).toBeNull();
  });

  describe('HIGHER_IS_BETTER', () => {
    it('exceeded when value >= target', () => {
      expect(computeAssignmentStatus(100, 100, 'HIGHER_IS_BETTER')).toBe('exceeded');
      expect(computeAssignmentStatus(120, 100, 'HIGHER_IS_BETTER')).toBe('exceeded');
    });
    it('on_track at >= 90%', () => {
      expect(computeAssignmentStatus(95, 100, 'HIGHER_IS_BETTER')).toBe('on_track');
    });
    it('at_risk at >= 70%', () => {
      expect(computeAssignmentStatus(75, 100, 'HIGHER_IS_BETTER')).toBe('at_risk');
    });
    it('behind below 70%', () => {
      expect(computeAssignmentStatus(50, 100, 'HIGHER_IS_BETTER')).toBe('behind');
    });
  });

  describe('LOWER_IS_BETTER', () => {
    it('exceeded when value <= target', () => {
      expect(computeAssignmentStatus(80, 100, 'LOWER_IS_BETTER')).toBe('exceeded');
      expect(computeAssignmentStatus(100, 100, 'LOWER_IS_BETTER')).toBe('exceeded');
    });
    it('behind when far above target', () => {
      expect(computeAssignmentStatus(200, 100, 'LOWER_IS_BETTER')).toBe('behind');
    });
    it('at_risk / on_track between', () => {
      expect(computeAssignmentStatus(120, 100, 'LOWER_IS_BETTER')).toBe('on_track'); // 20% over
      expect(computeAssignmentStatus(140, 100, 'LOWER_IS_BETTER')).toBe('at_risk'); // 40% over
    });
  });

  it('treats a zero target safely (no division blow-up)', () => {
    expect(computeAssignmentStatus(5, 0, 'HIGHER_IS_BETTER')).toBe('exceeded'); // met/beat 0
    expect(computeAssignmentStatus(0, 0, 'LOWER_IS_BETTER')).toBe('exceeded');
  });

  it('returns on_track for non-directional KPIs with a target', () => {
    expect(computeAssignmentStatus(5, 10, 'NEUTRAL')).toBe('on_track');
    expect(computeAssignmentStatus(5, 10, 'TARGET_IS_BEST')).toBe('on_track');
  });
});
