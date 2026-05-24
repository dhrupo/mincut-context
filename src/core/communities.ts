import { createRequire } from 'node:module';
import type { SymbolGraph } from './graph.js';

// graphology + graphology-communities-louvain are CommonJS — bridge via require.
const require_ = createRequire(import.meta.url);
const { UndirectedGraph } = require_('graphology') as {
  UndirectedGraph: new () => GraphologyGraph;
};
const louvain = require_('graphology-communities-louvain') as (
  graph: GraphologyGraph,
  opts?: { rng?: () => number },
) => Record<string, number>;

interface GraphologyGraph {
  addNode(key: string): void;
  hasEdge(s: string, t: string): boolean;
  addEdge(s: string, t: string, attrs?: { weight?: number }): string;
  updateEdgeAttribute(s: string, t: string, name: string, updater: (v: unknown) => unknown): void;
  order: number;
  size: number;
}

export interface CommunityOptions {
  /** Optional deterministic RNG seed for reproducible runs. */
  seed?: number;
}

/**
 * Louvain community detection on the symbol graph.
 *
 * Why undirected?  Community detection asks "which nodes are densely
 * interconnected" — a directed call edge a→b should still place a and b in
 * the same module.  We collapse to an undirected weight-summed multigraph.
 *
 * Returns a Map<nodeId, communityId>.  Community IDs are arbitrary integers;
 * only equality is meaningful (two nodes share a community iff equal).
 */
export function detectCommunities(
  symbols: SymbolGraph,
  options: CommunityOptions = {},
): Map<string, number> {
  const g = new UndirectedGraph();
  for (const id of symbols.nodes()) g.addNode(id);
  // Sum directed weights to a single undirected edge weight per pair.
  for (const sourceId of symbols.nodes()) {
    for (const e of symbols.outEdges(sourceId)) {
      const a = sourceId;
      const b = e.target;
      if (a === b) continue;
      if (g.hasEdge(a, b)) {
        g.updateEdgeAttribute(a, b, 'weight', (v) => Number(v ?? 0) + e.data.weight);
      } else {
        g.addEdge(a, b, { weight: e.data.weight });
      }
    }
  }

  const rng = options.seed !== undefined ? mulberry32(options.seed) : Math.random;
  // Louvain with no edges returns a single community for everything; for an
  // isolated-node graph the library treats every node as its own community,
  // which matches our test contract.
  const raw = louvain(g, { rng });
  return new Map(Object.entries(raw));
}

/** Tiny deterministic PRNG so tests can lock results across runs. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
