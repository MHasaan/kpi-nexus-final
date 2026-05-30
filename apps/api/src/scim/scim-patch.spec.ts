/**
 * Pure SCIM helpers. flattenScimUserPatch accepts both Okta shapes (flat
 * `{active:false}` and the RFC-7644 PatchOp envelope) and normalizes to a small
 * update object. parseScimFilter pulls `userName eq "..."` / member value
 * filters. Lenient by design — IdPs vary.
 */
import { describe, expect, test } from 'vitest';

import { flattenScimUserPatch, parseEqFilter, parseMemberValueFilter } from './scim-patch.js';

describe('flattenScimUserPatch', () => {
  test('flat active:false', () => {
    expect(flattenScimUserPatch({ active: false })).toEqual({ active: false });
  });
  test('flat active:true', () => {
    expect(flattenScimUserPatch({ active: true })).toEqual({ active: true });
  });
  test('PatchOp with path=active', () => {
    expect(flattenScimUserPatch({ Operations: [{ op: 'replace', path: 'active', value: false }] })).toEqual({ active: false });
  });
  test('PatchOp with no path, value is an object', () => {
    expect(flattenScimUserPatch({ Operations: [{ op: 'Replace', value: { active: false } }] })).toEqual({ active: false });
  });
  test('PatchOp op is case-insensitive (add)', () => {
    expect(flattenScimUserPatch({ Operations: [{ op: 'add', path: 'active', value: true }] })).toEqual({ active: true });
  });
  test('PatchOp remove on a user attr is ignored', () => {
    expect(flattenScimUserPatch({ Operations: [{ op: 'remove', path: 'active' }] })).toEqual({});
  });
  test('coerces stringy booleans', () => {
    expect(flattenScimUserPatch({ Operations: [{ op: 'replace', path: 'active', value: 'False' }] })).toEqual({ active: false });
    expect(flattenScimUserPatch({ active: 'true' })).toEqual({ active: true });
  });
  test('extracts displayName from flat + name object', () => {
    expect(flattenScimUserPatch({ displayName: 'Ada L' }).displayName).toBe('Ada L');
    expect(flattenScimUserPatch({ name: { givenName: 'Ada', familyName: 'Lovelace' } }).displayName).toBe('Ada Lovelace');
  });
  test('empty patch → {}', () => {
    expect(flattenScimUserPatch({})).toEqual({});
  });
});

describe('parseEqFilter', () => {
  test('parses userName eq "x@y.com"', () => {
    expect(parseEqFilter('userName eq "x@y.com"', 'userName')).toBe('x@y.com');
  });
  test('case-insensitive attribute + single quotes', () => {
    expect(parseEqFilter("userName Eq 'a@b.com'", 'userName')).toBe('a@b.com');
  });
  test('returns null when attr does not match', () => {
    expect(parseEqFilter('displayName eq "Bob"', 'userName')).toBeNull();
    expect(parseEqFilter(undefined, 'userName')).toBeNull();
  });
});

describe('parseMemberValueFilter', () => {
  test('extracts the member id from members[value eq "u_1"]', () => {
    expect(parseMemberValueFilter('members[value eq "u_1"]')).toBe('u_1');
  });
  test('returns null for non-member paths', () => {
    expect(parseMemberValueFilter('displayName')).toBeNull();
  });
});
