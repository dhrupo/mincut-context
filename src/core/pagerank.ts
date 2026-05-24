import type { SymbolGraph } from './graph.js';

export interface PageRankOptions {
  /**
   * Personalization vector: node id → mass.  Values do not need to sum to 1;
   * they will be normalized.  Must be non-empty.
   */
  seeds: ReadonlyMap<string, number>;

  /** Damping factor.  Standard PageRank uses 0.85. */
  alpha?: number;

  /** Maximum power-iteration steps before forced halt. */
  maxIterations?: number;

  /** L1 convergence threshold across one iteration. */
  tolerance?: number;
}

/**
 * Personalized PageRank via power iteration.
 *
 *     r ← α · M · r  +  (1 − α) · p
 *
 * where M is the column-stochastic transition matrix derived from edge weights,
 * p is the personalization vector, and dangling nodes redistribute their mass
 * back through p (so the chain is ergodic and convergence is guaranteed).
 *
 * Why personalized?  The restart vector p is concentrated on the task's seed
 * nodes — symbols matched by the user's query — so rank mass pools around the
 * region of the graph that's structurally relevant to the task instead of
 * spreading uniformly.  This is what makes the algorithm task-aware.
 */
export function personalizedPageRank(
  graph: SymbolGraph,
  options: PageRankOptions,
): Map<string, number> {
  const { seeds, alpha = 0.85, maxIterations = 100, tolerance = 1e-8 } = options;

  if (seeds.size === 0) {
    throw new Error('personalizedPageRank requires at least one seed');
  }

  for (const id of seeds.keys()) {
    if (!graph.hasNode(id)) {
      throw new Error(`seed node not in graph: ${id}`);
    }
  }

  const nodes = graph.nodes();
  const n = nodes.length;
  if (n === 0) return new Map();

  // Build normalized personalization vector p.
  let totalSeed = 0;
  for (const w of seeds.values()) totalSeed += w;
  if (totalSeed <= 0) throw new Error('seed weights must sum to a positive number');

  const p = new Map<string, number>();
  for (const [id, w] of seeds) p.set(id, w / totalSeed);

  // Precompute outgoing weight sums per node (for column normalization).
  const outWeight = new Map<string, number>();
  for (const id of nodes) {
    let sum = 0;
    for (const e of graph.outEdges(id)) sum += e.data.weight;
    outWeight.set(id, sum);
  }

  // Initialize r ← p extended over all nodes (0 for non-seeds).
  let r = new Map<string, number>();
  for (const id of nodes) r.set(id, p.get(id) ?? 0);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Map<string, number>();

    // 1. Sum mass coming from dangling nodes (no outgoing edges).
    let danglingMass = 0;
    for (const id of nodes) {
      if ((outWeight.get(id) ?? 0) === 0) {
        danglingMass += r.get(id) ?? 0;
      }
    }

    // 2. Initialize next ← (1 − α) · p   plus dangling redistribution through p.
    for (const id of nodes) {
      const personalization = p.get(id) ?? 0;
      next.set(id, (1 - alpha) * personalization + alpha * danglingMass * personalization);
    }

    // 3. Propagate α · M · r across outgoing edges.
    for (const id of nodes) {
      const out = outWeight.get(id) ?? 0;
      if (out === 0) continue;
      const ri = r.get(id) ?? 0;
      if (ri === 0) continue;
      for (const edge of graph.outEdges(id)) {
        const share = alpha * ri * (edge.data.weight / out);
        next.set(edge.target, (next.get(edge.target) ?? 0) + share);
      }
    }

    // 4. Convergence check (L1 distance).
    let delta = 0;
    for (const id of nodes) {
      delta += Math.abs((next.get(id) ?? 0) - (r.get(id) ?? 0));
    }
    r = next;
    if (delta < tolerance) break;
  }

  return r;
}
