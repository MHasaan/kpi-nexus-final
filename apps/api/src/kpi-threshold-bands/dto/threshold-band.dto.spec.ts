import { describe, expect, it } from 'vitest';

import { CreateThresholdBandDtoSchema, UpdateThresholdBandDtoSchema } from './threshold-band.dto.js';

const base = { name: 'Band', color: '#000000', order: 1 };

describe('threshold band DTOs (BE-012)', () => {
  it('rejects a band whose lower bound is above its upper bound', () => {
    expect(CreateThresholdBandDtoSchema.safeParse({ ...base, lower: 900, upper: 100 }).success).toBe(false);
  });

  it('accepts ordered, equal and open-ended bounds', () => {
    for (const b of [{ lower: 100, upper: 900 }, { lower: 5, upper: 5 }, { lower: null, upper: 10 }, { lower: 10 }, {}]) {
      expect(CreateThresholdBandDtoSchema.safeParse({ ...base, ...b }).success).toBe(true);
    }
  });

  it('rejects an update that inverts both bounds at once', () => {
    expect(UpdateThresholdBandDtoSchema.safeParse({ lower: 9, upper: 1 }).success).toBe(false);
    expect(UpdateThresholdBandDtoSchema.safeParse({ lower: 9 }).success).toBe(true);
  });
});
