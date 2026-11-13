/**
 * Unit tests for PermissionGuard.
 *
 * Because the web vitest config uses environment: 'node' (no jsdom / no
 * @testing-library/react installed), this spec tests the guard at the module
 * level by calling the component function directly and inspecting its return
 * value — a valid approach for simple render-or-null components.
 *
 * If jsdom + @testing-library/react are ever added to the project,
 * replace these tests with proper render() assertions.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock usePermissions before importing the component under test
// ---------------------------------------------------------------------------
const mockHas = vi.fn<(key: string) => boolean>();

vi.mock('../../lib/use-permissions', () => ({
  usePermissions: () => ({
    permissions: [],
    ready: true,
    has: mockHas,
    hasAny: vi.fn(),
  }),
}));

// Import AFTER the mock is wired up.
import { PermissionGuard } from './permission-guard';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PermissionGuard', () => {
  test('renders children when the permission is granted', () => {
    mockHas.mockReturnValue(true);

    const child = React.createElement('span', null, 'child text');
    const result = PermissionGuard({ permission: 'kpi:write', children: child });

    // When granted, PermissionGuard wraps children in a fragment.
    // React.createElement('>', {}, child) — the fragment contains our child.
    expect(result).not.toBeNull();
  });

  test('renders null when the permission is denied', () => {
    mockHas.mockReturnValue(false);

    const child = React.createElement('span', null, 'child text');
    const result = PermissionGuard({ permission: 'kpi:write', children: child });

    expect(result).toBeNull();
  });

  test('passes the correct permission key to has()', () => {
    mockHas.mockReturnValue(false);

    PermissionGuard({ permission: 'user:manage', children: null });

    expect(mockHas).toHaveBeenCalledWith('user:manage');
  });
});
