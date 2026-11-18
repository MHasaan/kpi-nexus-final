import { describe, expect, test } from 'vitest';

import { UpdatePositionDtoSchema } from './create-position.dto.js';

// Plan 7.7: a position could not be edited from the page. On update, null takes a value away.
describe('UpdatePositionDtoSchema', () => {
  test('any one field can be changed on its own', () => {
    expect(UpdatePositionDtoSchema.parse({ level: 4 })).toEqual({ level: 4 });
    expect(UpdatePositionDtoSchema.parse({ name: ' Staff Engineer ' })).toEqual({ name: 'Staff Engineer' });
  });

  test('null clears the track, the pay grade and the description', () => {
    expect(UpdatePositionDtoSchema.parse({ track: null, payGrade: null, description: null })).toEqual({
      track: null,
      payGrade: null,
      description: null,
    });
  });

  test('a name cannot be cleared, and a level stays within range', () => {
    expect(UpdatePositionDtoSchema.safeParse({ name: null }).success).toBe(false);
    expect(UpdatePositionDtoSchema.safeParse({ level: 101 }).success).toBe(false);
  });
});
