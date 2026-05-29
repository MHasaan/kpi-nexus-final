import { describe, expect, it } from 'vitest';

import { type UnitNode, computeInheritedAssignments } from './inheritance.js';

// Tree:  A → B → C ,  A → D ,  (E standalone root)
const units: UnitNode[] = [
  { id: 'A', parentUnitId: null },
  { id: 'B', parentUnitId: 'A' },
  { id: 'C', parentUnitId: 'B' },
  { id: 'D', parentUnitId: 'A' },
  { id: 'E', parentUnitId: null },
];

function map(list: Array<{ unitId: string; sourceUnitId: string }>): Record<string, string> {
  return Object.fromEntries(list.map((x) => [x.unitId, x.sourceUnitId]));
}

describe('computeInheritedAssignments', () => {
  it('returns nothing when there are no direct assignments', () => {
    expect(computeInheritedAssignments(units, new Set())).toEqual([]);
  });

  it('propagates a root direct assignment to all descendants', () => {
    const result = map(computeInheritedAssignments(units, new Set(['A'])));
    // A is direct (excluded); B, C, D inherit from A; E is unrelated.
    expect(result).toEqual({ B: 'A', C: 'A', D: 'A' });
  });

  it('lets a nearer direct ancestor override a farther one', () => {
    // A direct + B direct → C inherits from B (nearest), D from A.
    const result = map(computeInheritedAssignments(units, new Set(['A', 'B'])));
    expect(result).toEqual({ C: 'B', D: 'A' });
  });

  it('does not create an inherited row for a unit that is itself direct', () => {
    const result = computeInheritedAssignments(units, new Set(['A', 'C']));
    expect(result.find((r) => r.unitId === 'C')).toBeUndefined(); // C is direct
    expect(map(result)).toEqual({ B: 'A', D: 'A' });
  });

  it('excludes units with no direct ancestor', () => {
    // Only B direct → C inherits from B; A/D/E have no direct ancestor.
    const result = map(computeInheritedAssignments(units, new Set(['B'])));
    expect(result).toEqual({ C: 'B' });
  });

  it('handles independent roots', () => {
    const result = map(computeInheritedAssignments(units, new Set(['A', 'E'])));
    // E is a childless root → no inheritors; A propagates to B,C,D.
    expect(result).toEqual({ B: 'A', C: 'A', D: 'A' });
  });

  it('is cycle-safe (defensive parent loop)', () => {
    const cyclic: UnitNode[] = [
      { id: 'X', parentUnitId: 'Y' },
      { id: 'Y', parentUnitId: 'X' },
    ];
    // No direct rows → empty; must not infinite-loop.
    expect(computeInheritedAssignments(cyclic, new Set())).toEqual([]);
    // X direct → Y inherits from X (walk up from Y: parent X is direct).
    expect(map(computeInheritedAssignments(cyclic, new Set(['X'])))).toEqual({ Y: 'X' });
  });
});
