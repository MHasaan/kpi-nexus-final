import { describe, expect, test } from 'vitest';

import { CreateKpiDtoSchema, UpdateKpiDtoSchema } from './create-kpi.dto.js';

describe('UpdateKpiDtoSchema — clearing a field (plan 7.4)', () => {
  test('null clears a target, thresholds, unit, description, category, owner and perspective', () => {
    const parsed = UpdateKpiDtoSchema.safeParse({
      targetValue: null,
      warningThreshold: null,
      criticalThreshold: null,
      unit: null,
      description: null,
      categoryId: null,
      ownerUserId: null,
      scorecardQuadrant: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.targetValue).toBeNull();
  });

  test('leaving a field out still means no change', () => {
    const parsed = UpdateKpiDtoSchema.safeParse({ name: 'Renamed' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'targetValue' in parsed.data).toBe(false);
  });

  test('what cannot be empty still cannot be null', () => {
    expect(UpdateKpiDtoSchema.safeParse({ name: null }).success).toBe(false);
    expect(UpdateKpiDtoSchema.safeParse({ direction: null }).success).toBe(false);
    expect(UpdateKpiDtoSchema.safeParse({ tags: null }).success).toBe(false);
  });

  test('values are still checked', () => {
    expect(UpdateKpiDtoSchema.safeParse({ targetValue: 'ten' }).success).toBe(false);
    expect(UpdateKpiDtoSchema.safeParse({ scorecardQuadrant: 'SIDEWAYS' }).success).toBe(false);
    expect(UpdateKpiDtoSchema.safeParse({ nonsense: 1 }).success).toBe(false);
  });

  test('creating a KPI does not take null: there is nothing to clear', () => {
    expect(CreateKpiDtoSchema.safeParse({ name: 'Revenue', targetValue: null }).success).toBe(false);
  });
});
