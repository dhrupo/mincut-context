import type { SymbolGraph } from './graph.js';
import type { SelectOptions, SelectionEntry, SelectionResult } from './select.js';

/**
 * CELF — Cost-Effective Lazy Forward selection (Leskovec et al., 2007).
 *
 * Functionally equivalent to greedySelect, but uses a lazy priority queue:
 * each candidate carries a cached score that's only recomputed when it
 * bubbles to the top of the heap.  When a node is added to T, only nodes
 * with a direct edge to the new addition need to be marked stale — every
 * other candidate's attachment ratio is unchanged.
 *
 * Why it can be faster: the naive greedy is O(picks × |V|) per iteration.
 * CELF avoids re-scoring nodes whose neighborhood didn't change.
 *
 * Why it's NOT always faster:
 *   - Building the initial heap is O(|V|).
 *   - For small/sparse graphs, the constant overhead of a heap can exceed
 *     the savings.
 *   - Our objective isn't strictly monotone non-decreasing (the score
 *     function is rank × attach / tokens; once attach changes, the score
 *     can move in either direction), so we must re-check candidates that
 *     gain attachment, not just decrement them.
 *
 * Returns the same SelectionResult shape as greedySelect — drop-in.
 */
export function celfSelect(graph: SymbolGraph, options: SelectOptions): SelectionResult {
  const {
    seeds,
    ranks,
    budget,
    rankWeight = 1,
    attachmentWeight = 1,
    communities,
    communityBoost = 0,
  } = options;

  const seedCommunities = new Set<number>();
  if (communities && communityBoost > 0) {
    for (const id of seeds) {
      const c = communities.get(id);
      if (c !== undefined) seedCommunities.add(c);
    }
  }

  const selected = new Set<string>();
  const entries: SelectionEntry[] = [];
  let usedTokens = 0;

  // 1. Seeds first — identical to greedy.
  for (const id of seeds) {
    const data = graph.getNode(id);
    if (!data) throw new Error(`seed not in graph: ${id}`);
    if (usedTokens + data.tokens > budget) {
      throw new Error(
        `seeds exceed budget: seed "${id}" needs ${data.tokens} tokens, ${
          budget - usedTokens
        } remaining of budget ${budget}`,
      );
    }
    selected.add(id);
    usedTokens += data.tokens;
    entries.push({
      id,
      tokens: data.tokens,
      rank: ranks.get(id) ?? 0,
      reason: 'seed — matched directly by task',
      community: communities?.get(id),
    });
  }

  // 2. Build initial candidate scores.  Lazy means: each node's score is
  // computed once up front, then recomputed only when invalidated.
  interface Candidate {
    id: string;
    score: number;
    rank: number;
    attach: number;
    stale: boolean;
  }

  const candidates = new Map<string, Candidate>();
  for (const id of graph.nodes()) {
    if (selected.has(id)) continue;
    candidates.set(id, scoreOf(id));
  }

  // 3. Lazy greedy: repeatedly pull the highest-cached-score candidate.
  //    If it's stale, re-score and push back; if fresh, accept.
  while (true) {
    const remaining = budget - usedTokens;
    if (remaining <= 0) break;

    // Find the top candidate that fits the budget.  We sort lazily.
    let best: Candidate | null = null;
    for (const c of candidates.values()) {
      const data = graph.getNode(c.id);
      if (!data || data.tokens > remaining) continue;
      if (!best || c.score > best.score) best = c;
    }
    if (!best) break;

    // If stale, re-score and try again.
    if (best.stale) {
      const fresh = scoreOf(best.id);
      candidates.set(best.id, fresh);
      // Loop again — fresh score may no longer be the max.
      continue;
    }

    if (best.attach === 0) {
      // No connection to T — same cut-boundary constraint as greedy.  Drop it.
      candidates.delete(best.id);
      continue;
    }

    // Accept it.
    selected.add(best.id);
    const data = graph.getNode(best.id)!;
    usedTokens += data.tokens;
    entries.push({
      id: best.id,
      tokens: data.tokens,
      rank: best.rank,
      reason: reasonFor(best.attach, best.rank),
      community: communities?.get(best.id),
    });
    candidates.delete(best.id);

    // Invalidate any candidate that has an edge touching the newly-added node.
    // Only those nodes' attach values can have changed.
    const dirty = new Set<string>();
    for (const e of graph.outEdges(best.id)) dirty.add(e.target);
    for (const e of graph.inEdges(best.id)) dirty.add(e.target);
    for (const id of dirty) {
      const c = candidates.get(id);
      if (c) c.stale = true;
    }
  }

  return {
    selected,
    entries,
    tokens: usedTokens,
    cutCost: graph.cutCost(selected),
  };

  function scoreOf(id: string): Candidate {
    const data = graph.getNode(id);
    if (!data) return { id, score: -Infinity, rank: 0, attach: 0, stale: false };
    const attach = attachmentRatio(graph, id, selected);
    if (attach === 0) {
      return { id, score: -Infinity, rank: ranks.get(id) ?? 0, attach: 0, stale: false };
    }
    const rank = ranks.get(id) ?? 0;
    let raw = (rankWeight * rank * attach * attachmentWeight) / Math.max(data.tokens, 1);
    if (communities && communityBoost > 0) {
      const c = communities.get(id);
      if (c !== undefined && seedCommunities.has(c)) raw *= 1 + communityBoost;
    }
    return { id, score: raw, rank, attach, stale: false };
  }
}

function attachmentRatio(graph: SymbolGraph, id: string, t: ReadonlySet<string>): number {
  let inside = 0;
  let total = 0;
  for (const e of graph.outEdges(id)) {
    total += e.data.weight;
    if (t.has(e.target)) inside += e.data.weight;
  }
  for (const e of graph.inEdges(id)) {
    total += e.data.weight;
    if (t.has(e.target)) inside += e.data.weight;
  }
  if (total === 0) return 0;
  return inside / total;
}

function reasonFor(attach: number, rank: number): string {
  if (attach >= 0.5 && rank > 0) return `attached (${pct(attach)}) + ranked (${rank.toFixed(3)})`;
  if (attach > 0) return `attached (${pct(attach)})`;
  if (rank > 0) return `ranked (${rank.toFixed(3)})`;
  return 'opportunistic';
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
