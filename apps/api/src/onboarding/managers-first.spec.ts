/**
 * Plan 3.2c: the team in an onboarding draft is invited managers first, so a
 * manager exists by the time the people who report to them are invited —
 * whatever order the wizard listed them in.
 */
import { describe, expect, test } from 'vitest';

import { managersFirst } from './onboarding.service.js';

const person = (email: string, manager?: string) => ({ email, fullName: email, ...(manager ? { manager } : {}) });
const order = (team: ReturnType<typeof person>[]) => managersFirst(team).map((p) => p.email);

describe('managersFirst', () => {
  test('a report listed before their manager is invited after them', () => {
    expect(order([person('dev@x.test', 'lead@x.test'), person('lead@x.test')])).toEqual(['lead@x.test', 'dev@x.test']);
  });

  test('a chain is walked from the top, however it was listed', () => {
    const team = [person('c@x.test', 'b@x.test'), person('b@x.test', 'a@x.test'), person('a@x.test')];
    expect(order(team)).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
  });

  test('a manager outside the list (the administrator) does not hold anyone back', () => {
    expect(order([person('lead@x.test', 'boss@x.test'), person('dev@x.test', 'LEAD@x.test')])).toEqual(['lead@x.test', 'dev@x.test']);
  });

  test('people with no manager keep the order they were listed in', () => {
    expect(order([person('z@x.test'), person('a@x.test')])).toEqual(['z@x.test', 'a@x.test']);
  });

  test('nobody is dropped, even from a loop the validator should have refused', () => {
    const team = [person('a@x.test', 'b@x.test'), person('b@x.test', 'a@x.test'), person('c@x.test')];
    expect(order(team).sort()).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
  });
});
