import { describe, expect, test } from 'vitest';

import { buildAlignmentTree } from './okr-tree';

type Node = { id: string; parentObjectiveId: string | null };
const n = (id: string, parentObjectiveId: string | null = null): Node => ({ id, parentObjectiveId });

/** Every id reachable by walking down from the roots (cycle-safe). */
function reachable(tree: ReturnType<typeof buildAlignmentTree<Node>>): string[] {
  const seen: string[] = [];
  const walk = (o: Node) => {
    if (seen.includes(o.id)) throw new Error(`cycle reached ${o.id}`);
    seen.push(o.id);
    for (const c of tree.childrenOf.get(o.id) ?? []) walk(c);
  };
  tree.roots.forEach(walk);
  return seen.sort();
}

describe('buildAlignmentTree (FE-003)', () => {
  test('a plain hierarchy keeps its shape', () => {
    const tree = buildAlignmentTree([n('a'), n('b', 'a'), n('c', 'b')]);
    expect(tree.roots.map((o) => o.id)).toEqual(['a']);
    expect(reachable(tree)).toEqual(['a', 'b', 'c']);
  });

  test('a parent outside the visible set makes the child a root', () => {
    const tree = buildAlignmentTree([n('b', 'hidden')]);
    expect(tree.roots.map((o) => o.id)).toEqual(['b']);
  });

  test('a self-parented objective still appears, exactly once', () => {
    const tree = buildAlignmentTree([n('a', 'a'), n('b')]);
    expect(reachable(tree)).toEqual(['a', 'b']);
  });

  test('an A<->B cycle (with a child hanging off it) is fully visible and finite', () => {
    const tree = buildAlignmentTree([n('a', 'b'), n('b', 'a'), n('c', 'a')]);
    expect(reachable(tree)).toEqual(['a', 'b', 'c']);
  });
});
