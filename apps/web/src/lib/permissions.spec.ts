/**
 * Unit tests for permission utils + getCachedPermissions.
 * Runs in the vitest `node` environment — localStorage is mocked manually.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal localStorage mock (must be set up before the module is imported so
// that the `typeof window` guards see a window object)
// ---------------------------------------------------------------------------
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => { store[key] = value; },
  removeItem: (key: string): void => { delete store[key]; },
  clear: (): void => { for (const k of Object.keys(store)) delete store[k]; },
};

vi.stubGlobal('window', { localStorage: localStorageMock });
vi.stubGlobal('localStorage', localStorageMock);

// Import AFTER stubbing so module-level `typeof window` checks see the mock.
import {
  hasPermission,
  hasAny,
  getCachedPermissions,
  setCachedPermissions,
  clearCachedPermissions,
} from './permissions';

beforeEach(() => {
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// Pure predicate utils
// ---------------------------------------------------------------------------

describe('hasPermission', () => {
  test('returns true when the permission is in the list', () => {
    expect(hasPermission(['kpi:read', 'kpi:write'], 'kpi:read')).toBe(true);
  });

  test('returns false when the permission is absent', () => {
    expect(hasPermission(['kpi:read'], 'kpi:write')).toBe(false);
  });

  test('returns false for an empty permissions array', () => {
    expect(hasPermission([], 'kpi:write')).toBe(false);
  });

  test('is case-sensitive', () => {
    expect(hasPermission(['KPI:READ'], 'kpi:read')).toBe(false);
  });
});

describe('hasAny', () => {
  test('returns true when at least one key matches', () => {
    expect(hasAny(['kpi:read'], ['kpi:write', 'kpi:read'])).toBe(true);
  });

  test('returns false when no key matches', () => {
    expect(hasAny(['kpi:read'], ['kpi:write', 'user:manage'])).toBe(false);
  });

  test('returns false for empty permissions array', () => {
    expect(hasAny([], ['kpi:read', 'kpi:write'])).toBe(false);
  });

  test('returns false for empty keys array', () => {
    expect(hasAny(['kpi:read'], [])).toBe(false);
  });

  test('returns true when all keys are present', () => {
    expect(hasAny(['kpi:read', 'kpi:write'], ['kpi:read', 'kpi:write'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCachedPermissions + setCachedPermissions + clearCachedPermissions
// ---------------------------------------------------------------------------

describe('getCachedPermissions', () => {
  test('returns [] when the key is absent', () => {
    expect(getCachedPermissions()).toEqual([]);
  });

  test('returns [] when the stored value is not valid JSON', () => {
    localStorageMock.setItem('kpi-nexus.permissions', 'not-json{{');
    expect(getCachedPermissions()).toEqual([]);
  });

  test('returns [] when the stored value is valid JSON but not an array', () => {
    localStorageMock.setItem('kpi-nexus.permissions', JSON.stringify({ permissions: [] }));
    expect(getCachedPermissions()).toEqual([]);
  });

  test('returns the stored array when valid', () => {
    localStorageMock.setItem('kpi-nexus.permissions', JSON.stringify(['kpi:read', 'kpi:write']));
    expect(getCachedPermissions()).toEqual(['kpi:read', 'kpi:write']);
  });

  test('returns [] for an empty stored array', () => {
    localStorageMock.setItem('kpi-nexus.permissions', JSON.stringify([]));
    expect(getCachedPermissions()).toEqual([]);
  });
});

describe('setCachedPermissions', () => {
  test('persists permissions so getCachedPermissions reads them back', () => {
    setCachedPermissions(['kpi:read', 'user:manage']);
    expect(getCachedPermissions()).toEqual(['kpi:read', 'user:manage']);
  });
});

describe('clearCachedPermissions', () => {
  test('removes the cached permissions so getCachedPermissions returns []', () => {
    setCachedPermissions(['kpi:read']);
    clearCachedPermissions();
    expect(getCachedPermissions()).toEqual([]);
  });
});
