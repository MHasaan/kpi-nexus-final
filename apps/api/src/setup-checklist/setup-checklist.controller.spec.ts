import { describe, expect, it } from 'vitest';

import { REQUIRE_PERMISSIONS_KEY } from '../rbac/decorators/require-permissions.decorator.js';
import { SetupChecklistController } from './setup-checklist.controller.js';

const required = (method: keyof SetupChecklistController): unknown =>
  Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, SetupChecklistController.prototype[method]);

describe('SetupChecklistController permissions (BE-022)', () => {
  it('org-wide checklist writes require ORG_SETTINGS', () => {
    for (const m of ['complete', 'dismiss', 'reset'] as const) {
      expect(required(m)).toEqual(['ORG_SETTINGS']);
    }
  });

  it('reading the checklist stays open to every member', () => {
    expect(required('list')).toBeUndefined();
  });
});
