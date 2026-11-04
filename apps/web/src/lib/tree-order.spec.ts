import { describe, expect, test } from 'vitest';

import { treeOrder } from './tree-order';

type U = { id: string; parentUnitId: string | null };
const u = (id: string, parentUnitId: string | null = null): U => ({ id, parentUnitId });
const run = (items: U[]) =>
  treeOrder(items, (x) => x.parentUnitId).map(({ item, depth }) => `${'-'.repeat(depth)}${item.id}`);

describe('treeOrder (FE-010)', () => {
  test('children follow their parent, depth-first, keeping sibling order', () => {
    // API order scatters children away from their parents.
    expect(run([u('eng-be', 'eng'), u('sales'), u('eng'), u('eng-fe', 'eng'), u('sales-emea', 'sales')])).toEqual([
      'sales',
      '-sales-emea',
      'eng',
      '-eng-be',
      '-eng-fe',
    ]);
  });

  test('a parent outside the list makes the unit a root', () => {
    expect(run([u('a', 'hidden')])).toEqual(['a']);
  });

  test('every unit appears exactly once even with legacy cycles', () => {
    const out = run([u('a', 'b'), u('b', 'a'), u('c', 'c'), u('d')]);
    expect(out.map((s) => s.replace(/^-+/, '')).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
