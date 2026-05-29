/**
 * Pure breadth-first lineage traversal over an in-memory edge list. Kept free
 * of Prisma/Nest so the graph-walking can be unit-tested in isolation. Edges
 * point source -> target (the source feeds/produces the target).
 */

export interface LineageEdgeLite {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  transformType: string;
}

export interface LineageRef {
  type: string;
  id: string;
}

/** A node reached during traversal, with the edge + transform that reached it. */
export interface LineageHop extends LineageRef {
  via: string; // transformType of the edge traversed to reach this node
  edgeId: string;
}

export interface LineageLevel {
  depth: number;
  nodes: LineageHop[];
}

export type LineageDirection = 'upstream' | 'downstream';

// A pipe is fine here: type values are simple slugs (kpi, data_point, ...).
const KEY_SEP = '|';

export function nodeKey(type: string, id: string): string {
  return `${type}${KEY_SEP}${id}`;
}

/**
 * BFS from `start` in the given direction, up to `maxDepth` hops. Returns one
 * group per depth (1..maxDepth) that produced nodes; the start node is never
 * included, and each node is visited at most once (shallowest depth wins).
 *
 * - upstream:   follow edges whose TARGET is the current node -> yield its SOURCE
 * - downstream: follow edges whose SOURCE is the current node -> yield its TARGET
 */
export function traverse(
  edges: LineageEdgeLite[],
  start: LineageRef,
  direction: LineageDirection,
  maxDepth: number,
): LineageLevel[] {
  if (maxDepth < 1) return [];

  const visited = new Set<string>([nodeKey(start.type, start.id)]);
  const levels: LineageLevel[] = [];
  let frontier: LineageRef[] = [start];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const hops: LineageHop[] = [];
    const next: LineageRef[] = [];

    for (const node of frontier) {
      for (const e of edges) {
        const matchesHere =
          direction === 'upstream'
            ? e.targetType === node.type && e.targetId === node.id
            : e.sourceType === node.type && e.sourceId === node.id;
        if (!matchesHere) continue;

        const neighbor: LineageRef =
          direction === 'upstream'
            ? { type: e.sourceType, id: e.sourceId }
            : { type: e.targetType, id: e.targetId };

        const key = nodeKey(neighbor.type, neighbor.id);
        if (visited.has(key)) continue;
        visited.add(key);
        hops.push({ ...neighbor, via: e.transformType, edgeId: e.id });
        next.push(neighbor);
      }
    }

    if (hops.length === 0) break;
    levels.push({ depth, nodes: hops });
    frontier = next;
  }

  return levels;
}

/** Flatten traversal levels up to `depth` into a single ordered hop list. */
export function flattenLevels(levels: LineageLevel[], depth: number): LineageHop[] {
  return levels.filter((l) => l.depth <= depth).flatMap((l) => l.nodes);
}
