import { describe, expect, it } from 'vitest';

import { CreateResourcePermissionDtoSchema } from './create-resource-permission.dto.js';

const validBase = {
  subjectType: 'user' as const,
  subjectId: 'user-123',
  resourceType: 'kpi',
  resourceId: 'kpi-456',
};

describe('CreateResourcePermissionDtoSchema — action validation (Phase 3.5)', () => {
  it.each(['view', 'edit', 'delete', 'data_entry', 'manage'])(
    'accepts canonical action %s',
    (action) => {
      const result = CreateResourcePermissionDtoSchema.safeParse({ ...validBase, action });
      expect(result.success).toBe(true);
    },
  );

  it('rejects a non-canonical action', () => {
    const result = CreateResourcePermissionDtoSchema.safeParse({
      ...validBase,
      action: 'frobnicate',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing action', () => {
    const result = CreateResourcePermissionDtoSchema.safeParse({ ...validBase });
    expect(result.success).toBe(false);
  });
});
