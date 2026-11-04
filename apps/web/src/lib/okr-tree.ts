/**
 * Alignment tree for the OKR page. Roots are objectives with no parent, or whose
 * parent isn't in the visible set. Objectives caught in a parent cycle would be
 * reachable from no root and silently vanish (FE-003), so each unreached one is
 * promoted to a root and the edge closing its cycle is dropped — every objective
 * renders exactly once and walking the tree always terminates.
 */
export function buildAlignmentTree<T extends { id: string; parentObjectiveId: string | null }>(
  objectives: readonly T[],
): { roots: T[]; childrenOf: Map<string, T[]> } {
  const ids = new Set(objectives.map((o) => o.id));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];
  for (const o of objectives) {
    const parent = o.parentObjectiveId;
    if (parent && ids.has(parent)) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(o);
      childrenOf.set(parent, arr);
    } else {
      roots.push(o);
    }
  }

  const reached = new Set<string>();
  const mark = (o: T): void => {
    if (reached.has(o.id)) return;
    reached.add(o.id);
    for (const c of childrenOf.get(o.id) ?? []) mark(c);
  };
  roots.forEach(mark);

  for (const o of objectives) {
    if (reached.has(o.id)) continue;
    // o sits in a cycle: detach it from its parent and show it as a root.
    const siblings = childrenOf.get(o.parentObjectiveId!);
    if (siblings) childrenOf.set(o.parentObjectiveId!, siblings.filter((s) => s.id !== o.id));
    roots.push(o);
    mark(o);
  }
  return { roots, childrenOf };
}
