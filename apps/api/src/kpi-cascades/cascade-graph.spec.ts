import { describe, expect, it } from 'vitest';

import { computeLevels, wouldCreateCycle, type CascadeEdge } from './cascade-graph.js';

function edge(parentKpiId: string, childKpiId: string): CascadeEdge {
  return { parentKpiId, childKpiId };
}

describe('wouldCreateCycle', () => {
  it('rejects a self-edge', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('rejects a direct back-edge (child is already a parent of parent)', () => {
    // existing: a -> b  (a parent of b). Adding b -> a would cycle.
    expect(wouldCreateCycle([edge('a', 'b')], 'b', 'a')).toBe(true);
  });

  it('rejects a transitive back-edge', () => {
    // a -> b -> c. Adding c -> a cycles (a is reachable from c's new child a).
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
  });

  it('allows a new leaf', () => {
    expect(wouldCreateCycle([edge('a', 'b')], 'b', 'c')).toBe(false);
  });

  it('allows a diamond (shared descendant, no cycle)', () => {
    // a -> b, a -> c, b -> d. Adding c -> d is a diamond, not a cycle.
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd')];
    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false);
  });
});

describe('computeLevels', () => {
  it('assigns level 0 to roots and increments per hop', () => {
    // a -> b -> c
    const levels = computeLevels([edge('a', 'b'), edge('b', 'c')]);
    expect(levels.get('a')).toBe(0);
    expect(levels.get('b')).toBe(1);
    expect(levels.get('c')).toBe(2);
  });

  it('gives a diamond node the deeper level (longest path)', () => {
    // a -> b, a -> c, b -> d, c -> d, and a -> e -> c (so c is depth 2 via e)
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('a', 'e'), edge('e', 'c')];
    // c reachable as a->c (1) and a->e->c (2) => level 2; d = max(b=1, c=2)+1 = 3
    expect(computeLevels(edges).get('c')).toBe(2);
    expect(computeLevels(edges).get('d')).toBe(3);
  });

  it('handles multiple independent roots', () => {
    const levels = computeLevels([edge('a', 'b'), edge('x', 'y')]);
    expect(levels.get('a')).toBe(0);
    expect(levels.get('x')).toBe(0);
    expect(levels.get('b')).toBe(1);
    expect(levels.get('y')).toBe(1);
  });
});
