/**
 * Pure graph helpers for the cascade DAG (parent -> child rollup edges). Kept
 * free of Prisma/Nest so cycle detection and level assignment can be unit-tested
 * in isolation.
 */

export interface CascadeEdge {
  parentKpiId: string;
  childKpiId: string;
}

/**
 * Would adding the edge `parent -> child` create a cycle in the existing
 * parent->child graph? True for a self-edge, or when `parent` is already
 * reachable as a descendant of `child` (so the new edge would close a loop).
 */
export function wouldCreateCycle(edges: CascadeEdge[], parentKpiId: string, childKpiId: string): boolean {
  if (parentKpiId === childKpiId) return true;

  // children[x] = nodes directly below x
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.parentKpiId) ?? [];
    list.push(e.childKpiId);
    children.set(e.parentKpiId, list);
  }

  // DFS down from `child`: if we can reach `parent`, the new edge cycles.
  const stack = [childKpiId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === parentKpiId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of children.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Longest-path depth from roots for every node in the DAG. Roots (never a
 * child) are level 0; each node is one deeper than its deepest parent. Assumes
 * the graph is acyclic (enforced at attach time via `wouldCreateCycle`).
 */
export function computeLevels(edges: CascadeEdge[]): Map<string, number> {
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const nodes = new Set<string>();

  for (const e of edges) {
    nodes.add(e.parentKpiId);
    nodes.add(e.childKpiId);
    const list = children.get(e.parentKpiId) ?? [];
    list.push(e.childKpiId);
    children.set(e.parentKpiId, list);
    indegree.set(e.childKpiId, (indegree.get(e.childKpiId) ?? 0) + 1);
    if (!indegree.has(e.parentKpiId)) indegree.set(e.parentKpiId, 0);
  }

  const level = new Map<string, number>();
  // Kahn's algorithm, relaxing levels (longest path) as we go.
  const queue: string[] = [];
  for (const n of nodes) {
    if ((indegree.get(n) ?? 0) === 0) {
      level.set(n, 0);
      queue.push(n);
    }
  }
  const remaining = new Map(indegree);
  while (queue.length > 0) {
    const node = queue.shift()!;
    const base = level.get(node) ?? 0;
    for (const child of children.get(node) ?? []) {
      level.set(child, Math.max(level.get(child) ?? 0, base + 1));
      const d = (remaining.get(child) ?? 0) - 1;
      remaining.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  return level;
}
