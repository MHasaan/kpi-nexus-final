/**
 * Pure org-unit KPI inheritance resolution. Kept free of Prisma/Nest so the
 * tree-walk can be unit-tested in isolation. A PER_UNIT KPI assigned directly
 * to a unit cascades down to descendants as "inherited" rows — each descendant
 * inherits from its NEAREST direct-assigned ancestor (a closer direct row
 * overrides a farther one). Units that are themselves direct, or have no
 * direct ancestor, get no inherited row.
 */

export interface UnitNode {
  id: string;
  parentUnitId: string | null;
}

export interface InheritedAssignment {
  unitId: string;
  sourceUnitId: string;
}

export function computeInheritedAssignments(
  units: UnitNode[],
  directUnitIds: Set<string>,
): InheritedAssignment[] {
  const parentOf = new Map<string, string | null>();
  for (const u of units) parentOf.set(u.id, u.parentUnitId);

  const result: InheritedAssignment[] = [];
  for (const u of units) {
    if (directUnitIds.has(u.id)) continue; // direct rows are not inherited

    // Walk up to the nearest direct ancestor (cycle-guarded).
    const seen = new Set<string>([u.id]);
    let cursor = parentOf.get(u.id) ?? null;
    while (cursor !== null && !seen.has(cursor)) {
      if (directUnitIds.has(cursor)) {
        result.push({ unitId: u.id, sourceUnitId: cursor });
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return result;
}
