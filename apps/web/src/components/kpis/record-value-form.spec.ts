import { describe, expect, test } from 'vitest';

import { ApiError } from '../../lib/api-client';

import { recordErrorMessage } from './record-value-form';

describe('recordErrorMessage (UI-003)', () => {
  test('a wrong-endpoint refusal says where the value belongs', () => {
    const err = new ApiError(422, 'This KPI has scope PER_UNIT.', 'SCOPE_MISMATCH', {
      scope: 'PER_UNIT',
      correctEndpoint: '/org-units/kpi-assignments/:assignmentId/data',
    });
    expect(recordErrorMessage(err)).toBe(
      'This KPI has scope PER_UNIT. Record it through /org-units/kpi-assignments/:assignmentId/data.',
    );
  });

  test('a refusal with no endpoint hint shows the API message as it is', () => {
    expect(recordErrorMessage(new ApiError(403, 'You can only record values for a unit you manage or belong to', 'UNIT_NOT_IN_SCOPE'))).toBe(
      'You can only record values for a unit you manage or belong to',
    );
  });

  test('a negative value on a KPI that disallows one keeps the API wording', () => {
    expect(recordErrorMessage(new ApiError(422, 'This KPI does not allow negative values', 'NEGATIVE_NOT_ALLOWED'))).toBe(
      'This KPI does not allow negative values',
    );
  });

  test('anything else still gets a sentence', () => {
    expect(recordErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(recordErrorMessage('boom')).toBe('Could not record that value.');
  });
});
