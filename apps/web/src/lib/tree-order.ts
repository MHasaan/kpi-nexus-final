/**
 * Depth-first order for a parent-linked list: each item directly followed by
 * its children (sibling order preserved), with its depth. Items whose parent
 * isn't in the list are roots. Items caught in a parent cycle (legacy data from
 * before BE-009/BE-020) would be reachable from no root, so each unreached one
 * is promoted to a root — every item appears exactly once and the walk ends.
 */
export function treeOrder<T extends { id: string }>(
  items: readonly T[],
  parentOf: (item: T) => string | null | undefined,
): Array<{ item: T; depth: number }> {
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of items) {
    const parent = parentOf(item);
    if (parent && ids.has(parent) && parent !== item.id) {
      children.set(parent, [...(children.get(parent) ?? []), item]);
    } else {
      roots.push(item);
    }
  }

  const out: Array<{ item: T; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (item: T, depth: number): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ item, depth });
    for (const child of children.get(item.id) ?? []) walk(child, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  for (const item of items) if (!seen.has(item.id)) walk(item, 0);
  return out;
}
