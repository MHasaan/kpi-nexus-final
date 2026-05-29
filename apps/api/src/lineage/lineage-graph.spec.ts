import { describe, expect, it } from 'vitest';

import {
  type LineageEdgeLite,
  flattenLevels,
  nodeKey,
  traverse,
} from './lineage-graph.js';

function edge(over: Partial<LineageEdgeLite> & { id: string }): LineageEdgeLite {
  return {
    sourceType: 'kpi',
    sourceId: 's',
    targetType: 'kpi',
    targetId: 't',
    transformType: 'FORMULA',
    ...over,
  };
}

// Chain: a → b → c → d  (source feeds target). Plus a side input e → c.
const chain: LineageEdgeLite[] = [
  edge({ id: 'e1', sourceId: 'a', targetId: 'b' }),
  edge({ id: 'e2', sourceId: 'b', targetId: 'c', transformType: 'CASCADE_ROLLUP' }),
  edge({ id: 'e3', sourceId: 'c', targetId: 'd' }),
  edge({ id: 'e4', sourceId: 'e', targetId: 'c', transformType: 'INGEST' }),
];

describe('nodeKey', () => {
  it('combines type and id', () => {
    expect(nodeKey('kpi', 'x')).toBe('kpi|x');
    expect(nodeKey('data_point', '1')).not.toBe(nodeKey('kpi', '1'));
  });
});

describe('traverse upstream', () => {
  it('returns immediate parents at depth 1', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'c' }, 'upstream', 1);
    expect(levels).toHaveLength(1);
    expect(levels[0]!.depth).toBe(1);
    expect(levels[0]!.nodes.map((n) => n.id).sort()).toEqual(['b', 'e']);
    expect(levels[0]!.nodes.find((n) => n.id === 'e')!.via).toBe('INGEST');
  });

  it('walks multiple hops grouped by depth', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'c' }, 'upstream', 5);
    expect(levels.map((l) => l.depth)).toEqual([1, 2]);
    expect(levels[0]!.nodes.map((n) => n.id).sort()).toEqual(['b', 'e']);
    expect(levels[1]!.nodes.map((n) => n.id)).toEqual(['a']); // b's parent
  });

  it('stops when no further parents exist', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'a' }, 'upstream', 5);
    expect(levels).toEqual([]);
  });
});

describe('traverse downstream', () => {
  it('walks children grouped by depth', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'b' }, 'downstream', 5);
    expect(levels.map((l) => l.depth)).toEqual([1, 2]);
    expect(levels[0]!.nodes.map((n) => n.id)).toEqual(['c']);
    expect(levels[1]!.nodes.map((n) => n.id)).toEqual(['d']);
  });

  it('respects maxDepth', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'a' }, 'downstream', 1);
    expect(levels).toHaveLength(1);
    expect(levels[0]!.nodes.map((n) => n.id)).toEqual(['b']);
  });
});

describe('cycle safety', () => {
  it('does not loop forever on a cyclic graph', () => {
    const cyclic: LineageEdgeLite[] = [
      edge({ id: 'c1', sourceId: 'x', targetId: 'y' }),
      edge({ id: 'c2', sourceId: 'y', targetId: 'x' }),
    ];
    const levels = traverse(cyclic, { type: 'kpi', id: 'x' }, 'downstream', 10);
    // x→y (depth 1), y→x is already visited so traversal terminates
    expect(levels.map((l) => l.depth)).toEqual([1]);
    expect(levels[0]!.nodes.map((n) => n.id)).toEqual(['y']);
  });

  it('visits each node at the shallowest depth only', () => {
    // diamond: a→b, a→c, b→d, c→d. d reachable at depth 2 via two paths, once.
    const diamond: LineageEdgeLite[] = [
      edge({ id: 'd1', sourceId: 'a', targetId: 'b' }),
      edge({ id: 'd2', sourceId: 'a', targetId: 'c' }),
      edge({ id: 'd3', sourceId: 'b', targetId: 'd' }),
      edge({ id: 'd4', sourceId: 'c', targetId: 'd' }),
    ];
    const levels = traverse(diamond, { type: 'kpi', id: 'a' }, 'downstream', 5);
    expect(levels[1]!.nodes.filter((n) => n.id === 'd')).toHaveLength(1);
  });
});

describe('flattenLevels', () => {
  it('flattens up to the requested depth', () => {
    const levels = traverse(chain, { type: 'kpi', id: 'b' }, 'downstream', 5);
    expect(flattenLevels(levels, 1).map((n) => n.id)).toEqual(['c']);
    expect(flattenLevels(levels, 5).map((n) => n.id)).toEqual(['c', 'd']);
  });
});
