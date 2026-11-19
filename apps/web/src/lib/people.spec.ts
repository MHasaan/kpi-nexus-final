import { describe, expect, test } from 'vitest';

import { distinctIds, peopleFor, withFound } from './people';

describe('peopleFor', () => {
  const ada = { id: 'u_a', fullName: 'Ada Admin' };
  const bo = { id: 'u_b', fullName: 'Bo Builder' };

  test('the people involved, plus yourself, by name', () => {
    expect(peopleFor([bo], ada)).toEqual([ada, bo]);
  });

  test('you are listed once even when you are also involved', () => {
    expect(peopleFor([ada, bo], ada)).toEqual([ada, bo]);
  });

  test('before you are known, just the people involved', () => {
    expect(peopleFor([bo], null)).toEqual([bo]);
    expect(peopleFor([], null)).toEqual([]);
  });
});

describe('distinctIds', () => {
  test('drops blanks and repeats; the order does not depend on the input order', () => {
    expect(distinctIds(['b', null, 'a', undefined, '', 'b'])).toEqual(['a', 'b']);
    expect(distinctIds(['a', 'b'])).toEqual(distinctIds(['b', 'a']));
  });
});

// X-05: someone who may not list people can find a colleague by name (owner decision 2026-11-20). A picker
// offers who the page knows plus whoever was found.
describe('withFound', () => {
  const ada = { id: 'u_a', fullName: 'Ada Admin', email: 'ada@example.test' };
  const bo = { id: 'u_b', fullName: 'Bo Builder' };
  const cy = { id: 'u_c', fullName: 'Cy Clerk' };

  test('a colleague found by name joins the people the page knows, each once, in name order', () => {
    expect(withFound([cy, ada], [bo, cy])).toEqual([ada, bo, cy]);
  });

  test('what the page knew about someone is kept over what the look-up found (it may hold an email)', () => {
    expect(withFound([ada], [{ id: 'u_a', fullName: 'Ada Admin' }])).toEqual([ada]);
  });

  test('with nobody found, the list is the one the page had, in its own order', () => {
    const known = [cy, ada];
    expect(withFound(known, [])).toBe(known);
  });
});
