/**
 * Applying a template used to replace the organisation section wholesale, so
 * "Northwind Logistics" became "Acme SaaS" the moment a template was chosen.
 */
import { describe, expect, test } from 'vitest';

import { keepOwnOrganization } from './onboarding.service.js';

const template = { name: 'Acme SaaS', industry: 'Software', type: 'B2B SaaS', sizeTier: 'MEDIUM' };

describe('keepOwnOrganization', () => {
  test('the name already given is kept; the rest comes from the template', () => {
    expect(keepOwnOrganization({ name: 'Northwind Logistics' }, template)).toEqual({ ...template, name: 'Northwind Logistics' });
  });

  test('anything else already chosen is kept too', () => {
    const own = { name: 'Northwind', industry: 'Logistics', timezone: 'Asia/Karachi' };
    expect(keepOwnOrganization(own, template)).toEqual({ name: 'Northwind', industry: 'Logistics', type: 'B2B SaaS', sizeTier: 'MEDIUM', timezone: 'Asia/Karachi' });
  });

  test('a blank field has not been chosen, so the template fills it', () => {
    expect(keepOwnOrganization({ name: '  ', industry: '' }, template)).toEqual(template);
  });

  test('with nothing said yet, the template stands', () => {
    expect(keepOwnOrganization(undefined, template)).toEqual(template);
    expect(keepOwnOrganization(null, template)).toEqual(template);
  });

  test('zero and false are choices, not blanks', () => {
    expect(keepOwnOrganization({ name: 'N', weekStartsOn: 0 }, template).weekStartsOn).toBe(0);
  });
});
