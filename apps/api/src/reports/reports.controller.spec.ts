import { describe, expect, it } from 'vitest';

import { REQUIRE_PERMISSIONS_KEY } from '../rbac/decorators/require-permissions.decorator.js';
import { ReportsController } from './reports.controller.js';

const required = (method: keyof ReportsController): unknown =>
  Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, ReportsController.prototype[method]);

// Manual QA (2026-11-19, F-051): a read-only person could make, rotate and revoke public embed links for a KPI.
// A public link is a way of publishing a KPI's figures outside the app, so it takes the reports-management key.
describe('ReportsController permissions', () => {
  it('making and revoking public embed links takes REPORTS_MANAGE', () => {
    expect(required('mintEmbedToken')).toEqual(['REPORTS_MANAGE']);
    expect(required('revokeEmbedToken')).toEqual(['REPORTS_MANAGE']);
  });

  it('reading a report or the board pack stays at REPORTS_VIEW', () => {
    expect(required('generate')).toEqual(['REPORTS_VIEW']);
    expect(required('getBoardPack')).toEqual(['REPORTS_VIEW']);
  });
});
