import { describe, expect, it } from 'vitest';

import { parseFormula } from '../formula/formula.js';
import {
  type DependencyEdge,
  extractIdentifiers,
  wouldCreateDependencyCycle,
} from './formula-deps.js';

describe('extractIdentifiers', () => {
  it('collects a single identifier', () => {
    expect(extractIdentifiers(parseFormula('revenue'))).toEqual(['revenue']);
  });

  it('collects identifiers from a binary expression', () => {
    expect(extractIdentifiers(parseFormula('revenue - cost')).sort()).toEqual(['cost', 'revenue']);
  });

  it('recurses into nested + unary expressions', () => {
    expect(extractIdentifiers(parseFormula('(a + b) * -c')).sort()).toEqual(['a', 'b', 'c']);
  });

  it('collects call arguments but not the function name', () => {
    // max(a, b) — 'max' is a builtin function, not a KPI identifier
    expect(extractIdentifiers(parseFormula('max(a, b) + 1')).sort()).toEqual(['a', 'b']);
  });

  it('dedupes repeated identifiers', () => {
    expect(extractIdentifiers(parseFormula('revenue + revenue / 2'))).toEqual(['revenue']);
  });

  it('returns empty for a constant expression', () => {
    expect(extractIdentifiers(parseFormula('1 + 2 * 3'))).toEqual([]);
  });
});

describe('wouldCreateDependencyCycle', () => {
  function dep(sourceKpiId: string, dependentKpiId: string): DependencyEdge {
    return { sourceKpiId, dependentKpiId };
  }

  it('detects a direct cycle', () => {
    // existing: A depends on B (B -> A). Adding A -> B (B depends on A) cycles.
    const edges = [dep('b', 'a')];
    expect(wouldCreateDependencyCycle(edges, 'a', 'b')).toBe(true);
  });

  it('detects a transitive cycle', () => {
    // c depends on b, b depends on a (a->b->c). Adding c as a source of a cycles.
    const edges = [dep('a', 'b'), dep('b', 'c')];
    expect(wouldCreateDependencyCycle(edges, 'c', 'a')).toBe(true);
  });

  it('allows a non-cyclic new edge', () => {
    const edges = [dep('a', 'b')];
    expect(wouldCreateDependencyCycle(edges, 'c', 'b')).toBe(false);
  });

  it('allows a self-reference check (source === dependent is a cycle)', () => {
    expect(wouldCreateDependencyCycle([], 'a', 'a')).toBe(true);
  });
});
