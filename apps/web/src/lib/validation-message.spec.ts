import { describe, expect, test } from 'vitest';

import { validationMessage } from './validation-message';

const issue = (path: Array<string | number>, message: string) => ({ path, message });

describe('validationMessage — which field a refused request is about (QA-L10)', () => {
  test('a generic refusal with one issue names the field and says what is wrong', () => {
    const out = validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues: [issue(['retentionDays'], 'Too small: expected number to be >=1')] });
    expect(out).toBe('Retention days: Too small: expected number to be >=1');
  });

  test('a field inside a list or a group reads as a path a person can follow', () => {
    const out = validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues: [issue(['levels', 0, 'delayMinutes'], 'Too big')] });
    expect(out).toBe('Levels, item 1, delay minutes: Too big');
  });

  test('several issues are all said, up to three, and the rest are counted', () => {
    const issues = ['a', 'b', 'c', 'd', 'e'].map((f) => issue([f], 'Required'));
    expect(validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues })).toBe('A: Required; B: Required; C: Required; and 2 more.');
  });

  test('an issue about the whole body has no field to name', () => {
    expect(validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues: [issue([], 'Unrecognized key: "colour"')] })).toBe('Unrecognized key: "colour"');
  });

  test('a message the API wrote for people is kept as it is', () => {
    const details = { issues: [issue(['expiresAt'], 'Choose an expiry time in the future')] };
    expect(validationMessage('Choose an expiry time in the future', 'VALIDATION_ERROR', details)).toBe('Choose an expiry time in the future');
  });

  test('anything without issues, or not a validation refusal, is kept as it is', () => {
    expect(validationMessage('Invalid request body', 'VALIDATION_ERROR', undefined)).toBe('Invalid request body');
    expect(validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues: [] })).toBe('Invalid request body');
    expect(validationMessage('KPI not found', 'NOT_FOUND', { issues: [issue(['x'], 'y')] })).toBe('KPI not found');
    expect(validationMessage('Invalid request body', 'VALIDATION_ERROR', { issues: 'nonsense' })).toBe('Invalid request body');
  });
});
