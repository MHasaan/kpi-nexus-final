import { describe, expect, test } from 'vitest';

import { distinctIds, peopleFor } from './people';

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
